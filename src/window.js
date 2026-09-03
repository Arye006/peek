'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, execFile } = require('child_process');
const { browserStatePath, browserProfile, STATE_DIR, userConfigPath } = require('./config');

const PLATFORM = process.platform;

/* --------------------------------------------------- finding a browser */

// Chromium-family browsers are the ones that support --app=, which is what
// turns a page into a real window with no tabs or address bar.
function candidates() {
  if (PLATFORM === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Beta.app/Contents/MacOS/Google Chrome Beta',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Vivaldi.app/Contents/MacOS/Vivaldi',
      path.join(os.homedir(), 'Applications/Google Chrome.app/Contents/MacOS/Google Chrome'),
    ];
  }

  if (PLATFORM === 'win32') {
    const roots = [
      process.env['PROGRAMFILES'],
      process.env['PROGRAMFILES(X86)'],
      process.env['LOCALAPPDATA'],
    ].filter(Boolean);
    const rel = [
      'Google\\Chrome\\Application\\chrome.exe',
      'Chromium\\Application\\chrome.exe',
      'BraveSoftware\\Brave-Browser\\Application\\brave.exe',
      'Microsoft\\Edge\\Application\\msedge.exe',
    ];
    return roots.flatMap((r) => rel.map((x) => path.join(r, x)));
  }

  // Linux and the BSDs: absolute paths first, then bare names resolved on PATH.
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/usr/bin/brave-browser',
    '/usr/bin/microsoft-edge',
    '/snap/bin/chromium',
    '/var/lib/flatpak/exports/bin/com.google.Chrome',
    'google-chrome',
    'chromium',
    'brave-browser',
  ];
}

function onPath(name) {
  const dirs = (process.env.PATH || '').split(path.delimiter).filter(Boolean);
  return dirs.some((d) => {
    try {
      fs.accessSync(path.join(d, name), fs.constants.X_OK);
      return true;
    } catch (_) {
      return false;
    }
  });
}

function findBrowser() {
  for (const c of candidates()) {
    if (path.isAbsolute(c)) {
      if (fs.existsSync(c)) return c;
    } else if (onPath(c)) {
      return c;
    }
  }
  return null;
}

/* ------------------------------------------------------------ helpers */

function alive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (_) {
    return false;
  }
}

function readState() {
  try {
    return JSON.parse(fs.readFileSync(browserStatePath, 'utf8'));
  } catch (_) {
    return {};
  }
}

function userConfig() {
  try {
    return JSON.parse(fs.readFileSync(userConfigPath, 'utf8'));
  } catch (_) {
    return {};
  }
}

// Hands a URL or path to whatever the desktop has registered for it.
function openExternally(target) {
  if (PLATFORM === 'darwin') return execFile('open', [target], () => {});
  if (PLATFORM === 'win32') return execFile('cmd', ['/c', 'start', '', target], () => {});
  return execFile('xdg-open', [target], () => {});
}

// Shows a file in Finder / Explorer / the desktop's file manager.
function reveal(file) {
  if (PLATFORM === 'darwin') return execFile('open', ['-R', file], () => {});
  if (PLATFORM === 'win32') return execFile('explorer', [`/select,${file}`], () => {});
  return execFile('xdg-open', [path.dirname(file)], () => {});
}

/* ------------------------------------------------------------ the window */

// Raising an existing window means talking to the window server, which macOS
// gates behind an Automation/Accessibility prompt. It is off by default: a
// live-updating window that does not steal focus needs no permissions at all.
// Set "focusWindow": true in the config to opt in. Only implemented on macOS.
function focus(pid) {
  if (PLATFORM !== 'darwin' || userConfig().focusWindow !== true) return false;
  execFile(
    'osascript',
    [
      '-e',
      `tell application "System Events" to set frontmost of (first process whose unix id is ${pid}) to true`,
    ],
    () => {}
  );
  return true;
}

function launch(url, { width = 1080, height = 1180 } = {}) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  const bin = findBrowser();

  if (!bin) {
    // No Chromium-family browser: an ordinary tab in the default browser still
    // gives a working preview, just without the dedicated-window feel.
    openExternally(url);
    fs.writeFileSync(browserStatePath, JSON.stringify({ pid: null, url, mode: 'default-browser', at: Date.now() }));
    return { mode: 'default-browser' };
  }

  const child = spawn(
    bin,
    [
      `--app=${url}`,
      `--user-data-dir=${browserProfile}`,
      `--window-size=${width},${height}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-networking',
      '--disable-component-update',
      '--disable-sync',
      '--no-service-autorun',
      '--password-store=basic',
    ],
    { detached: true, stdio: 'ignore' }
  );
  child.unref();

  fs.writeFileSync(
    browserStatePath,
    JSON.stringify({ pid: child.pid, url, mode: 'app-window', browser: path.basename(bin), at: Date.now() })
  );
  return { mode: 'app-window', pid: child.pid, browser: path.basename(bin) };
}

// Opens the preview window if it is not already running. An existing window is
// left where it is — its content updates over SSE without stealing focus.
function ensure(url) {
  const st = readState();
  if (st.mode === 'default-browser') {
    // A plain tab cannot be tracked by pid; the page reconnects on its own.
    return { mode: 'default-browser' };
  }
  if (alive(st.pid)) {
    return { mode: focus(st.pid) ? 'focused' : 'already open', pid: st.pid };
  }
  return launch(url);
}

function close() {
  const st = readState();
  if (alive(st.pid)) {
    try {
      process.kill(st.pid, 'SIGTERM');
    } catch (_) {}
  }
  try {
    fs.unlinkSync(browserStatePath);
  } catch (_) {}
}

module.exports = { ensure, launch, focus, close, alive, findBrowser, reveal, readState };
