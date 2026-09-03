'use strict';

const path = require('path');
const { Marked } = require('../vendor/marked.cjs');
const hljs = require('../vendor/highlight.min.js');

const ESCAPE_MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escapeHtml = (s) => String(s).replace(/[&<>"']/g, (c) => ESCAPE_MAP[c]);

function slugify(text, seen) {
  const base =
    String(text)
      .toLowerCase()
      .replace(/<[^>]*>/g, '')
      .replace(/[^\w\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-') || 'section';
  let slug = base;
  let n = 1;
  while (seen.has(slug)) slug = `${base}-${n++}`;
  seen.add(slug);
  return slug;
}

// Rewrites a relative resource path so the browser fetches it back through the
// server's /file route instead of hitting a URL that does not exist.
function localUrl(href, docPath) {
  const abs = path.resolve(path.dirname(docPath), href.split('#')[0].split('?')[0]);
  const hash = href.includes('#') ? '#' + href.split('#').slice(1).join('#') : '';
  return '/file?p=' + encodeURIComponent(abs) + hash;
}

const isExternal = (href) => /^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('//');

function render(markdown, docPath) {
  const seen = new Set();
  const toc = [];
  const tasks = { total: 0, done: 0 };

  const marked = new Marked({ gfm: true, breaks: false });

  marked.use({
    renderer: {
      heading(text, level) {
        const id = slugify(text, seen);
        if (level <= 3) toc.push({ id, level, text: String(text).replace(/<[^>]*>/g, '') });
        return `<h${level} id="${id}"><a class="anchor" href="#${id}" aria-hidden="true">#</a>${text}</h${level}>\n`;
      },

      code(code, infostring) {
        const lang = (infostring || '').trim().split(/\s+/)[0].toLowerCase();
        if (lang === 'mermaid') {
          return `<pre class="mermaid-block"><code class="mermaid">${escapeHtml(code)}</code></pre>\n`;
        }
        let body;
        let shown = lang;
        if (lang && hljs.getLanguage(lang)) {
          body = hljs.highlight(code, { language: lang, ignoreIllegals: true }).value;
        } else {
          const auto = hljs.highlightAuto(code);
          body = auto.value;
          shown = shown || auto.language || '';
        }
        return (
          `<div class="code-block"${shown ? ` data-lang="${escapeHtml(shown)}"` : ''}>` +
          `<button class="copy-btn" type="button" title="Copy">copy</button>` +
          `<pre><code class="hljs">${body}</code></pre></div>\n`
        );
      },

      listitem(text, task, checked) {
        if (task) {
          tasks.total += 1;
          if (checked) tasks.done += 1;
          return `<li class="task${checked ? ' done' : ''}">${text}</li>\n`;
        }
        return `<li>${text}</li>\n`;
      },

      link(href, title, text) {
        const h = href || '';
        if (isExternal(h) || h.startsWith('#')) {
          const ext = isExternal(h) ? ' target="_blank" rel="noreferrer"' : '';
          return `<a href="${escapeHtml(h)}"${title ? ` title="${escapeHtml(title)}"` : ''}${ext}>${text}</a>`;
        }
        // Relative link: another markdown file opens in the preview, anything else downloads.
        if (/\.mdx?($|[#?])/i.test(h)) {
          const abs = path.resolve(path.dirname(docPath), h.split('#')[0]);
          return `<a href="#" class="doc-link" data-path="${escapeHtml(abs)}">${text}</a>`;
        }
        return `<a href="${escapeHtml(localUrl(h, docPath))}">${text}</a>`;
      },

      image(href, title, text) {
        const src = isExternal(href) ? href : localUrl(href, docPath);
        return `<img src="${escapeHtml(src)}" alt="${escapeHtml(text || '')}"${
          title ? ` title="${escapeHtml(title)}"` : ''
        } loading="lazy">`;
      },
    },
  });

  const html = marked.parse(markdown);

  // Title: first H1 if present, else the filename.
  const m = markdown.match(/^\s*#\s+(.+?)\s*$/m);
  const title = m ? m[1].replace(/[*_`]/g, '') : path.basename(docPath);

  return { html, toc, tasks, title };
}

module.exports = { render, escapeHtml };
