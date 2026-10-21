'use strict';

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const profile = "C:\\Users\\peek's café\\browser-profile";
const source = fs.readFileSync(path.join(__dirname, '../src/window.js'), 'utf8');

// Run the Windows branch on every CI platform without signalling real processes.
function windowsWindow(readProcesses) {
  const module = { exports: {} };
  vm.runInNewContext(source, {
    module,
    require(name) {
      if (name === './config') return { browserProfile: profile };
      if (name === 'child_process') return { execFileSync: readProcesses };
      return require(name);
    },
    process: { platform: 'win32', pid: 42, env: {}, kill() {} },
    setTimeout,
  });
  return module.exports;
}

test('Windows ownership checks the command line rather than trusting a live pid', () => {
  const win = windowsWindow(() => JSON.stringify([
    { ProcessId: 100, CommandLine: `chrome.exe --user-data-dir="${profile}"` },
    { ProcessId: 101, CommandLine: 'node.exe unrelated.js' },
    { ProcessId: 102, CommandLine: `chrome.exe --user-data-dir="${profile}-other"` },
  ]));
  assert.equal(win.ours(100), true);
  assert.equal(win.ours(101), false);
  assert.equal(win.ours(102), false, 'a profile path that only shares a prefix is not ours');
});

test('Windows profile discovery skips helpers, unrelated processes and invalid records', () => {
  const win = windowsWindow(() => JSON.stringify([
    { ProcessId: 100, CommandLine: `chrome.exe --user-data-dir="${profile}"` },
    { ProcessId: 101, CommandLine: `chrome.exe --type=renderer --user-data-dir="${profile}"` },
    { ProcessId: 102, CommandLine: 'chrome.exe --user-data-dir="C:\\other"' },
    { ProcessId: 103, CommandLine: null },
    { ProcessId: 104, CommandLine: `chrome.exe --user-data-dir="${profile}-other"` },
    { ProcessId: 42, CommandLine: `node.exe "${profile}"` },
    { ProcessId: 0, CommandLine: `chrome.exe "${profile}"` },
  ]));
  assert.deepEqual(Array.from(win.profilePids()), [100]);
});

test('Windows accepts a single process result and handles a profile path as data', () => {
  const win = windowsWindow((file, args, options) => {
    assert.equal(file, 'powershell.exe');
    assert.ok(!args.join(' ').includes(profile), 'the profile is not interpolated into a command');
    assert.equal(options.env.PEEK_BROWSER_PROFILE, profile);
    assert.equal(options.windowsHide, true);
    assert.deepEqual(Array.from(options.stdio), ['ignore', 'pipe', 'ignore']);
    return JSON.stringify({ ProcessId: 100, CommandLine: `chrome.exe "${profile}"` });
  });
  assert.deepEqual(Array.from(win.profilePids()), [100]);
});

for (const [argument, expected] of [
  [`--user-data-dir="${profile}"`, true],
  [`"--user-data-dir=${profile}"`, true],
  [`"${profile}"`, true],
  [`--user-data-dir="${profile}-other"`, false],
  [`--user-data-dir="${profile} other"`, false],
  [`"--user-data-dir=${profile} other"`, false],
  [`--other="${profile}"`, false],
  [`"prefix ${profile}"`, false],
  [`"prefix \\"${profile}\\""`, false],
  [`"prefix ""${profile}"""`, false],
]) {
  test(`Windows matches the complete profile argument ${JSON.stringify(argument)}`, () => {
    const win = windowsWindow(() => JSON.stringify({
      ProcessId: 100, CommandLine: `"C:\\Program Files\\Chrome\\chrome.exe" ${argument}`,
    }));
    assert.equal(win.ours(100), expected);
    assert.deepEqual(Array.from(win.profilePids()), expected ? [100] : []);
  });
}

for (const result of ['', 'null', 'not json', '{}']) {
  test(`Windows leaves processes alone for an unusable process result ${JSON.stringify(result)}`, () => {
    const win = windowsWindow(() => result);
    assert.equal(win.ours(100), false);
    assert.deepEqual(Array.from(win.profilePids()), []);
  });
}

test('Windows leaves processes alone when PowerShell cannot query them', () => {
  const win = windowsWindow(() => { throw new Error('PowerShell unavailable'); });
  assert.equal(win.ours(100), false);
  assert.deepEqual(Array.from(win.profilePids()), []);
});
