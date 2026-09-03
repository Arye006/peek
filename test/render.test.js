'use strict';

const { test } = require('node:test');
const assert = require('node:assert');
const { render } = require('../src/render');

const at = (md) => render(md, '/docs/plan.md');

test('takes its title from the first H1, falling back to the filename', () => {
  assert.equal(at('# Rollout plan\n\ntext').title, 'Rollout plan');
  assert.equal(at('no heading here').title, 'plan.md');
});

test('counts task-list progress', () => {
  const { tasks } = at('- [x] one\n- [x] two\n- [ ] three\n');
  assert.deepEqual(tasks, { total: 3, done: 2 });
});

test('builds an outline of headings down to level three', () => {
  const { toc } = at('# A\n\n## B\n\n### C\n\n#### D\n');
  assert.deepEqual(toc.map((h) => h.text), ['A', 'B', 'C']);
});

test('gives duplicate headings distinct anchors', () => {
  const { toc } = at('## Risks\n\n## Risks\n');
  assert.deepEqual(toc.map((h) => h.id), ['risks', 'risks-1']);
});

test('highlights fenced code and labels the language', () => {
  const { html } = at('```go\nfunc main() {}\n```\n');
  assert.match(html, /data-lang="go"/);
  assert.match(html, /hljs-keyword/);
});

test('leaves mermaid fences for the browser to render', () => {
  const { html } = at('```mermaid\ngraph LR\n A-->B\n```\n');
  assert.match(html, /<code class="mermaid">/);
  assert.doesNotMatch(html, /hljs/);
});

test('routes relative images back through the server', () => {
  const { html } = at('![x](./img/a.png)');
  assert.match(html, /src="\/file\?p=%2Fdocs%2Fimg%2Fa\.png"/);
});

test('leaves absolute URLs alone and opens them in a real browser', () => {
  const { html } = at('[x](https://example.com)');
  assert.match(html, /href="https:\/\/example\.com"/);
    assert.match(html, /target="_blank"/);
});

test('turns relative markdown links into in-window navigation', () => {
  const { html } = at('[next](./phase-2.md)');
  assert.match(html, /class="doc-link" data-path="\/docs\/phase-2\.md"/);
});

test('renders GFM tables', () => {
  const { html } = at('| a | b |\n|---|---|\n| 1 | 2 |\n');
  assert.match(html, /<table>/);
  assert.match(html, /<th>a<\/th>/);
});

test('escapes HTML inside code fences', () => {
  const { html } = at('```\n<script>alert(1)</script>\n```\n');
  assert.doesNotMatch(html, /<script>alert/);
});
