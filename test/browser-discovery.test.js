
'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const { candidates } = require('../src/window');

test('macOS candidates include missing browser locations', () => {
  const paths = candidates('darwin', '/Users/test');

  assert.ok(paths.includes(
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
  ));
  assert.ok(paths.includes(
    '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary'
  ));
  assert.ok(paths.includes(
    '/Applications/Microsoft Edge Beta.app/Contents/MacOS/Microsoft Edge Beta'
  ));
  assert.ok(paths.includes(
    path.posix.join('/Users/test', 'Applications/Brave Browser.app/Contents/MacOS/Brave Browser')
  ));
  assert.ok(paths.includes(
    path.posix.join('/Users/test', 'Applications/Vivaldi.app/Contents/MacOS/Vivaldi')
  ));
});

test('Windows candidates include Chrome channels and Vivaldi', () => {
  const paths = candidates('win32', 'C:\\Users\\test', {
    PROGRAMFILES: 'C:\\Program Files',
    'PROGRAMFILES(X86)': 'C:\\Program Files (x86)',
    LOCALAPPDATA: 'C:\\Users\\test\\AppData\\Local',
  }).join('\n');

  assert.match(paths, /Google\\Chrome\\Application\\chrome\.exe/);
  assert.match(paths, /Google\\Chrome Beta\\Application\\chrome\.exe/);
  assert.match(paths, /Google\\Chrome Dev\\Application\\chrome\.exe/);
  assert.match(paths, /Google\\Chrome SxS\\Application\\chrome\.exe/);
  assert.match(paths, /Vivaldi\\Application\\vivaldi\.exe/);
});

test('Linux candidates include Vivaldi, Edge Stable, and Flatpak browsers', () => {
  const paths = candidates('linux', '/home/test');

  assert.ok(paths.includes('/usr/bin/google-chrome'));
  assert.ok(paths.includes('/usr/bin/vivaldi-stable'));
  assert.ok(paths.includes('/usr/bin/microsoft-edge-stable'));
  assert.ok(paths.includes(
    path.posix.join('/home/test', '.local/share/flatpak/exports/bin/com.google.Chrome')
  ));
  assert.ok(paths.includes('/var/lib/flatpak/exports/bin/org.chromium.Chromium'));
  assert.ok(paths.includes('/var/lib/flatpak/exports/bin/com.brave.Browser'));
});
