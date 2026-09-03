'use strict';

const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const os = require('os');
const { render } = require('./render');
const { reveal } = require('./window');
const { STATE_DIR, statePath, MAX_DOCS, DEFAULT_PORT } = require('./config');

const SRC = __dirname;
const ROOT = path.dirname(SRC);

/* ------------------------------------------------------------------ state */

const state = {
  active: null, // absolute path of the doc on screen
  docs: [], // recent docs, most-recent first
  cache: null, // rendered payload for `active`
};

const clients = new Set();
let watcher = null;
let idleTimer = null;
let everConnected = false;

/* ------------------------------------------------------------- doc loading */

function wordCount(md) {
  const prose = md
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/[#>*_\-|]/g, ' ');
  const m = prose.match(/\b[\w'’-]+\b/g);
  return m ? m.length : 0;
}

async function loadDoc(file) {
  const [md, st] = await Promise.all([fsp.readFile(file, 'utf8'), fsp.stat(file)]);
  const { html, toc, tasks, title } = render(md, file);
  const words = wordCount(md);
  return {
    path: file,
    displayPath: file.startsWith(os.homedir()) ? '~' + file.slice(os.homedir().length) : file,
    title,
    html,
    toc,
    tasks,
    words,
    readMin: Math.max(1, Math.round(words / 220)),
    mtime: st.mtimeMs,
  };
}

async function refreshCache() {
  try {
    state.cache = await loadDoc(state.active);
    return true;
  } catch (err) {
    state.cache = null;
    return false;
  }
}

/* ---------------------------------------------------------------- watching */

function watch(file) {
  if (watcher) {
    watcher.close();
    watcher = null;
  }
  const dir = path.dirname(file);
  const base = path.basename(file);
  let timer = null;

  try {
    watcher = fs.watch(dir, (_event, name) => {
      // Editors and Claude's Write rename a temp file over the target, so the
      // directory is watched rather than the inode.
      if (name && name !== base) return;
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (!fs.existsSync(file)) return broadcast('gone', {});
        const ok = await refreshCache();
        if (ok) broadcast('changed', { switched: false, mtime: state.cache.mtime });
      }, 70);
    });
    watcher.on('error', () => {});
  } catch (_) {
    /* directory vanished; the next open re-establishes the watch */
  }
}

/* --------------------------------------------------------------------- SSE */

function broadcast(event, data) {
  const frame = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) {
    try {
      res.write(frame);
    } catch (_) {
      clients.delete(res);
    }
  }
}

function docListPayload() {
  return {
    active: state.active,
    docs: state.docs.map((p) => ({
      path: p,
      name: path.basename(p),
      dir: path.dirname(p).replace(os.homedir(), '~'),
    })),
  };
}

function armIdleExit() {
  clearTimeout(idleTimer);
  if (clients.size > 0) return;
  // Once the preview window has been closed there is nothing to serve.
  idleTimer = setTimeout(() => {
    if (clients.size === 0) shutdown(0);
  }, everConnected ? 5 * 60_000 : 3 * 60_000);
}

/* ------------------------------------------------------------------ routes */

async function openDoc(file) {
  const abs = path.resolve(file);
  state.active = abs;
  state.docs = [abs, ...state.docs.filter((p) => p !== abs)].slice(0, MAX_DOCS);
  await refreshCache();
  watch(abs);
  broadcast('docs', docListPayload());
  broadcast('changed', { switched: true });
}

// Markdown may contain raw HTML, and marked renders it as written — a plan
// pulled from an untrusted repo could otherwise run script inside a page that
// is allowed to read local files. This policy lets the page load only its own
// assets, so injected inline script, event-handler attributes and outbound
// requests are all refused. Verified not to affect mermaid, whose bundle needs
// neither eval nor inline script.
const CSP = [
  "default-src 'none'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' data:",
  "connect-src 'self'",
  "base-uri 'none'",
  "form-action 'none'",
  "frame-ancestors 'none'",
].join('; ');

function send(res, code, body, type = 'application/json') {
  res.writeHead(code, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'Content-Security-Policy': CSP,
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
  });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => {
      data += c;
      if (data.length > 1e6) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(data || '{}'));
      } catch (_) {
        resolve({});
      }
    });
  });
}

const MIME = {
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
};

const ASSETS = {
  '/assets/theme.css': path.join(SRC, 'theme.css'),
  '/assets/client.js': path.join(SRC, 'client.js'),
  '/assets/mermaid.min.js': path.join(ROOT, 'vendor', 'mermaid.min.js'),
};

// A requested file is only served when it sits beside a document that has been
// opened in this session — the server is otherwise not a filesystem browser.
function allowed(target) {
  return state.docs.some((d) => {
    const root = path.dirname(d);
    return target === d || target.startsWith(root + path.sep);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://127.0.0.1');
  const route = url.pathname;

  try {
    if (route === '/health') {
      return send(res, 200, { ok: true, pid: process.pid, active: state.active, docs: state.docs.length });
    }

    if (route === '/' || route === '/index.html') {
      const html = await fsp.readFile(path.join(SRC, 'shell.html'));
      return send(res, 200, html, 'text/html; charset=utf-8');
    }

    if (ASSETS[route]) {
      try {
        const buf = await fsp.readFile(ASSETS[route]);
        return send(res, 200, buf, MIME[path.extname(ASSETS[route])] || 'application/octet-stream');
      } catch (_) {
        return send(res, 404, '', 'text/plain');
      }
    }

    if (route === '/doc') {
      if (!state.cache) return res.writeHead(204).end();
      return send(res, 200, state.cache);
    }

    if (route === '/docs') return send(res, 200, docListPayload());

    if (route === '/events') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Content-Security-Policy': CSP,
        Connection: 'keep-alive',
      });
      res.write('retry: 1000\n\n');
      clients.add(res);
      everConnected = true;
      clearTimeout(idleTimer);
      res.write(`event: docs\ndata: ${JSON.stringify(docListPayload())}\n\n`);
      const ka = setInterval(() => res.write(': ping\n\n'), 25_000);
      req.on('close', () => {
        clearInterval(ka);
        clients.delete(res);
        armIdleExit();
      });
      return;
    }

    if (route === '/open' && req.method === 'POST') {
      const { path: p } = await readBody(req);
      if (!p) return send(res, 400, { error: 'path required' });
      await openDoc(p);
      return send(res, 200, { ok: true, active: state.active, found: !!state.cache });
    }

    if (route === '/reveal' && req.method === 'POST') {
      const { path: p } = await readBody(req);
      if (p && allowed(path.resolve(p))) reveal(path.resolve(p));
      return send(res, 200, { ok: true });
    }

    if (route === '/file') {
      const target = path.resolve(url.searchParams.get('p') || '');
      if (!allowed(target)) return send(res, 403, 'forbidden', 'text/plain');
      try {
        const buf = await fsp.readFile(target);
        return send(res, 200, buf, MIME[path.extname(target).toLowerCase()] || 'application/octet-stream');
      } catch (_) {
        return send(res, 404, 'not found', 'text/plain');
      }
    }

    if (route === '/quit' && req.method === 'POST') {
      send(res, 200, { ok: true });
      return setTimeout(() => shutdown(0), 50);
    }

    return send(res, 404, { error: 'not found' });
  } catch (err) {
    return send(res, 500, { error: String((err && err.message) || err) });
  }
});

/* -------------------------------------------------------------- lifecycle */

function shutdown(code) {
  try {
    const s = JSON.parse(fs.readFileSync(statePath, 'utf8'));
    if (s.serverPid === process.pid) fs.unlinkSync(statePath);
  } catch (_) {}
  process.exit(code);
}

process.on('SIGINT', () => shutdown(0));
process.on('SIGTERM', () => shutdown(0));

async function main() {
  const initial = process.argv[2];
  fs.mkdirSync(STATE_DIR, { recursive: true });

  const listen = (port) =>
    new Promise((resolve, reject) => {
      server.once('error', reject);
      server.listen(port, '127.0.0.1', () => {
        server.removeListener('error', reject);
        resolve();
      });
    });

  try {
    await listen(DEFAULT_PORT);
  } catch (_) {
    await listen(0);
  }

  const port = server.address().port;
  fs.writeFileSync(statePath, JSON.stringify({ port, serverPid: process.pid, started: Date.now() }, null, 2));

  if (initial) await openDoc(initial);
  armIdleExit();

  process.stdout.write(JSON.stringify({ port, pid: process.pid }) + '\n');
}

main().catch((err) => {
  process.stderr.write('peek server failed: ' + err.stack + '\n');
  process.exit(1);
});
