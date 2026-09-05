'use strict';

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { statePath, logPath, STATE_DIR } = require('./config');
const win = require('./window');

const SRC = __dirname;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function readState() {
  try {
    return JSON.parse(fs.readFileSync(statePath, 'utf8'));
  } catch (_) {
    return null;
  }
}

async function req(port, route, method = 'GET', body) {
  const res = await fetch(`http://127.0.0.1:${port}${route}`, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(4000),
  });
  const text = await res.text();
  try {
    return JSON.parse(text);
  } catch (_) {
    return text;
  }
}

async function liveServer() {
  const st = readState();
  if (!st || !st.port) return null;
  try {
    const h = await req(st.port, '/health');
    return h && h.ok ? st : null;
  } catch (_) {
    return null;
  }
}

async function startServer(initialFile) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const log = fs.openSync(logPath, 'a');
  const child = spawn(process.execPath, [path.join(SRC, 'server.js'), ...(initialFile ? [initialFile] : [])], {
    detached: true,
    stdio: ['ignore', log, log],
  });
  child.unref();

  for (let i = 0; i < 60; i++) {
    await sleep(50);
    const st = await liveServer();
    if (st) return st;
  }
  throw new Error('preview server did not start — see ' + logPath);
}

/* ------------------------------------------------------------------ commands */

async function cmdOpen(file, opts) {
  const abs = path.resolve(file);
  if (!fs.existsSync(abs)) {
    if (!opts.quiet) console.error(`peek: no such file: ${abs}`);
    process.exit(1);
  }

  let st = await liveServer();
  if (!st) st = await startServer(abs);
  else await req(st.port, '/open', 'POST', { path: abs });

  const url = `http://127.0.0.1:${st.port}/`;
  let window = { mode: 'skipped' };
  if (!opts.noWindow) window = await win.ensure(url, st.port);

  if (!opts.quiet) {
    console.log(`peek  ${path.basename(abs)}`);
    console.log(`  file    ${abs}`);
    console.log(`  url     ${url}`);
    console.log(`  window  ${window.mode}${window.pid ? ' (pid ' + window.pid + ')' : ''}`);
  }
}

async function cmdStatus() {
  const st = await liveServer();
  if (!st) return console.log('peek: not running');
  const h = await req(st.port, '/health');
  const b = win.readState();
  const label = b.mode === 'default-browser' ? 'default browser tab' : `${b.browser || 'browser'}, pid ${b.pid}`;
  // A browser process with no window connected is not an open preview — see
  // windowConnected() in window.js.
  const window = h.clients > 0 ? `open (${label})` : win.ours(b.pid) ? `closed (${label} still running)` : 'closed';
  console.log('peek: running');
  console.log(`  url     http://127.0.0.1:${st.port}/`);
  console.log(`  server  pid ${st.serverPid}`);
  console.log(`  window  ${window}`);
  console.log(`  active  ${h.active || '(none)'}`);
}

async function cmdStop() {
  const st = await liveServer();
  if (st) {
    try {
      await req(st.port, '/quit', 'POST');
    } catch (_) {}
  }
  win.close();
  console.log('peek: stopped');
}

const HELP = `peek — live markdown preview in a dedicated window

usage:
  peek <file.md>        open (or refresh) the preview for a file
  peek open <file.md>   same thing, explicitly
  peek status           show server / window state
  peek stop             close the window and shut the server down

flags:
  --no-window   update the server without opening a window
  --quiet       print nothing (used by the Claude Code hook)

config:  ~/.claude/peek/config.json
`;

async function main() {
  const major = Number(process.versions.node.split('.')[0]);
  if (major < 18) {
    throw new Error(`needs Node 18 or newer (found ${process.versions.node}) — peek uses fetch()`);
  }

  const argv = process.argv.slice(2);
  const opts = {
    noWindow: argv.includes('--no-window'),
    quiet: argv.includes('--quiet'),
  };
  const args = argv.filter((a) => !a.startsWith('--'));
  const cmd = args[0];

  if (!cmd || cmd === 'help' || argv.includes('--help') || argv.includes('-h')) return console.log(HELP);
  if (cmd === 'status') return cmdStatus();
  if (cmd === 'stop') return cmdStop();
  if (cmd === 'open') {
    if (!args[1]) return console.log(HELP);
    return cmdOpen(args[1], opts);
  }
  return cmdOpen(cmd, opts);
}

main().catch((err) => {
  if (!process.argv.includes('--quiet')) console.error('peek:', err.message);
  process.exit(1);
});
