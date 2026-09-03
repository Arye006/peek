'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'peek-srv-'));
const STATE = path.join(TMP, 'state');
const DOC = path.join(TMP, 'plan.md');
const SIBLING = path.join(TMP, 'notes.txt');
const SECRET = path.join(os.tmpdir(), 'peek-should-not-be-served.txt');

let child;
let port;

const get = (route) => fetch(`http://127.0.0.1:${port}${route}`);

before(async () => {
  fs.writeFileSync(DOC, '# Plan\n\n- [ ] ship it\n');
  fs.writeFileSync(SIBLING, 'sibling');
  fs.writeFileSync(SECRET, 'secret');

  child = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'server.js'), DOC], {
    env: { ...process.env, PEEK_STATE_DIR: STATE },
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  port = await new Promise((resolve, reject) => {
    let buf = '';
    child.stdout.on('data', (c) => {
      buf += c;
      const line = buf.split('\n')[0];
      if (line) {
        try {
          resolve(JSON.parse(line).port);
        } catch (_) {}
      }
    });
    child.stderr.on('data', (c) => reject(new Error(String(c))));
    setTimeout(() => reject(new Error('server did not report a port')), 8000);
  });
});

after(() => {
  if (child) child.kill('SIGTERM');
  fs.rmSync(TMP, { recursive: true, force: true });
  fs.rmSync(SECRET, { force: true });
});

test('binds loopback only and reports health', async () => {
  const h = await (await get('/health')).json();
  assert.equal(h.ok, true);
  assert.equal(h.active, DOC);
});

test('serves the rendered document', async () => {
  const doc = await (await get('/doc')).json();
  assert.equal(doc.title, 'Plan');
  assert.deepEqual(doc.tasks, { total: 1, done: 0 });
});

test('serves the shell and its assets', async () => {
  assert.equal((await get('/')).status, 200);
  assert.equal((await get('/assets/theme.css')).status, 200);
  assert.equal((await get('/assets/client.js')).status, 200);
});

test('serves files that sit beside an open document', async () => {
  const res = await get('/file?p=' + encodeURIComponent(SIBLING));
  assert.equal(res.status, 200);
  assert.equal(await res.text(), 'sibling');
});

test('refuses files outside every open document directory', async () => {
  const res = await get('/file?p=' + encodeURIComponent(SECRET));
  assert.equal(res.status, 403);
});

test('refuses traversal out of an allowed directory', async () => {
  const res = await get('/file?p=' + encodeURIComponent(path.join(TMP, '..', 'etc', 'hosts')));
  assert.equal(res.status, 403);
});

test('pushes a change event when the file is edited', async () => {
  const res = await get('/events');
  const reader = res.body.getReader();
  const seen = [];

  const read = (async () => {
    while (seen.join('').includes('event: changed') === false) {
      const { value, done } = await reader.read();
      if (done) break;
      seen.push(new TextDecoder().decode(value));
    }
  })();

  setTimeout(() => fs.appendFileSync(DOC, '\n## Added\n'), 150);
  await Promise.race([read, new Promise((r) => setTimeout(r, 5000))]);
  reader.cancel().catch(() => {});

  assert.ok(seen.join('').includes('event: changed'), 'expected a changed event');
});

test('locks the page down with a content security policy', async () => {
  const res = await get('/');
  const csp = res.headers.get('content-security-policy');
  assert.ok(csp, 'no CSP header');
  assert.match(csp, /script-src 'self'/);      // blocks inline script from markdown
  assert.match(csp, /connect-src 'self'/);     // blocks exfiltration
  assert.doesNotMatch(csp, /unsafe-inline[^;]*script/);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
});
