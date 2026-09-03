'use strict';

const $ = (sel) => document.querySelector(sel);

const els = {
  app: $('#app'),
  rail: $('#rail'),
  docs: $('#docs'),
  toc: $('#toc'),
  scroller: $('#scroller'),
  article: $('#article'),
  empty: $('#empty'),
  name: $('#doc-name'),
  path: $('#doc-path'),
  stamp: $('#stamp'),
  words: $('#words'),
  progress: $('#progress'),
  fill: $('#progress .fill'),
  ptext: $('#progress .ptext'),
  toast: $('#toast'),
};

let current = null; // path of the doc on screen
let mtime = 0;
let mermaidReady = null;

/* ---------------- theme ---------------- */

let urlOverride = false;

function applyTheme(mode) {
  const resolved =
    mode === 'system'
      ? matchMedia('(prefers-color-scheme: dark)').matches
        ? 'dark'
        : 'light'
      : mode;
  document.documentElement.dataset.theme = resolved;
  if (!urlOverride) localStorage.setItem('peek.theme', mode);
  if (mermaidReady) location.reload(); // mermaid bakes colors at render time
}

// ?theme=light|dark pins the theme for this page load without disturbing the
// stored preference. Handy for screenshots, and for keeping a second window in
// the other mode while comparing.
const urlTheme = new URLSearchParams(location.search).get('theme');
urlOverride = urlTheme === 'light' || urlTheme === 'dark';
const savedTheme = localStorage.getItem('peek.theme') || 'system';
applyTheme(urlTheme === 'light' || urlTheme === 'dark' ? urlTheme : savedTheme);
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if ((localStorage.getItem('peek.theme') || 'system') === 'system') applyTheme('system');
});

$('#theme-btn').addEventListener('click', () => {
  urlOverride = false; // an explicit click beats the URL and is worth remembering
  const order = ['system', 'light', 'dark'];
  const next = order[(order.indexOf(localStorage.getItem('peek.theme') || 'system') + 1) % 3];
  applyTheme(next);
  toast(`theme: ${next}`);
});

$('#rail-btn').addEventListener('click', () => els.app.classList.toggle('no-rail'));
$('#print-btn').addEventListener('click', () => window.print());
$('#reveal-btn').addEventListener('click', () => {
  if (current) fetch('/reveal', { method: 'POST', body: JSON.stringify({ path: current }) });
});

/* ---------------- toast ---------------- */

let toastTimer;
function toast(msg) {
  els.toast.textContent = msg;
  els.toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => els.toast.classList.remove('show'), 1600);
}

/* ---------------- rendering ---------------- */

function relTime(ts) {
  const s = Math.round((Date.now() - ts) / 1000);
  if (s < 5) return 'just now';
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function paint(doc, { isSwitch }) {
  const ratio = els.scroller.scrollTop / Math.max(1, els.scroller.scrollHeight - els.scroller.clientHeight);

  els.empty.hidden = true;
  els.article.hidden = false;
  els.article.innerHTML = doc.html;

  document.title = doc.title;
  els.name.textContent = doc.title;
  els.path.textContent = shortenPath(doc.displayPath || doc.path);
  els.path.title = doc.path;
  els.words.textContent = `${doc.words.toLocaleString()} words · ${doc.readMin} min`;

  if (doc.tasks.total > 0) {
    els.progress.classList.remove('hidden');
    const pct = Math.round((doc.tasks.done / doc.tasks.total) * 100);
    els.fill.style.width = pct + '%';
    els.ptext.textContent = `${doc.tasks.done}/${doc.tasks.total} done`;
  } else {
    els.progress.classList.add('hidden');
  }

  // TOC
  els.toc.innerHTML = doc.toc
    .map((h) => `<li><a class="lvl-${h.level}" href="#${h.id}">${escapeText(h.text)}</a></li>`)
    .join('');

  enhance();

  if (isSwitch) els.scroller.scrollTop = 0;
  else els.scroller.scrollTop = ratio * Math.max(1, els.scroller.scrollHeight - els.scroller.clientHeight);

  current = doc.path;
  mtime = doc.mtime;
  tick();
  renderMermaid();
}

function shortenPath(p) {
  if (p.length <= 64) return p;
  const parts = p.split('/');
  return parts.length > 4 ? [parts[0], '…', ...parts.slice(-3)].join('/') : p;
}

function escapeText(s) {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function enhance() {
  els.article.querySelectorAll('table').forEach((t) => {
    if (t.parentElement.classList.contains('table-wrap')) return;
    const wrap = document.createElement('div');
    wrap.className = 'table-wrap';
    t.replaceWith(wrap);
    wrap.appendChild(t);
  });

  els.article.querySelectorAll('.copy-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const code = btn.parentElement.querySelector('code');
      navigator.clipboard.writeText(code.innerText).then(() => {
        btn.textContent = 'copied';
        btn.classList.add('copied');
        setTimeout(() => {
          btn.textContent = 'copy';
          btn.classList.remove('copied');
        }, 1200);
      });
    });
  });

  els.article.querySelectorAll('a.doc-link').forEach((a) => {
    a.addEventListener('click', (e) => {
      e.preventDefault();
      openDoc(a.dataset.path);
    });
  });
}

async function renderMermaid() {
  const blocks = els.article.querySelectorAll('code.mermaid');
  if (!blocks.length) return;
  if (!mermaidReady) {
    if (!window.mermaid) {
      await new Promise((res, rej) => {
        const s = document.createElement('script');
        s.src = '/assets/mermaid.min.js';
        s.onload = res;
        s.onerror = rej;
        document.head.appendChild(s);
      }).catch(() => {});
    }
    if (!window.mermaid) return; // optional dep not installed — leave as code
    const dark = document.documentElement.dataset.theme === 'dark';
    window.mermaid.initialize({ startOnLoad: false, theme: dark ? 'dark' : 'neutral', securityLevel: 'strict' });
    mermaidReady = true;
  }
  let i = 0;
  for (const code of blocks) {
    const src = code.textContent;
    try {
      const { svg } = await window.mermaid.render('mmd-' + Date.now() + '-' + i++, src);
      code.parentElement.innerHTML = svg;
    } catch (_) {
      /* leave the raw fence visible if the diagram is malformed */
    }
  }
}

/* ---------------- scroll spy ---------------- */

let spyRaf;
els.scroller.addEventListener('scroll', () => {
  if (spyRaf) return;
  spyRaf = requestAnimationFrame(() => {
    spyRaf = null;
    const heads = [...els.article.querySelectorAll('h1[id],h2[id],h3[id]')];
    let cur = heads[0];
    for (const h of heads) {
      if (h.getBoundingClientRect().top <= 90) cur = h;
      else break;
    }
    els.toc.querySelectorAll('a').forEach((a) => {
      a.classList.toggle('current', !!cur && a.getAttribute('href') === '#' + cur.id);
    });
  });
});

/* ---------------- data ---------------- */

async function refresh(isSwitch) {
  const r = await fetch('/doc', { cache: 'no-store' });
  if (r.status === 204) return;
  const doc = await r.json();
  paint(doc, { isSwitch: isSwitch || doc.path !== current });
}

function openDoc(path) {
  fetch('/open', { method: 'POST', body: JSON.stringify({ path }) });
}

function paintDocList(list, active) {
  els.docs.innerHTML = list
    .map((d) => {
      const cls = d.path === active ? ' class="active"' : '';
      return `<li${cls}><button data-path="${escapeText(d.path)}" title="${escapeText(d.path)}">${escapeText(
        d.name
      )}<span class="dir">${escapeText(d.dir)}</span></button></li>`;
    })
    .join('');
  els.docs.querySelectorAll('button').forEach((b) =>
    b.addEventListener("click", () => openDoc(b.dataset.path))
  );
}

/* ---------------- live connection ---------------- */

function connect() {
  const es = new EventSource('/events');

  es.addEventListener('open', () => document.body.classList.remove('disconnected'));

  es.addEventListener('changed', (e) => {
    const d = JSON.parse(e.data);
    refresh(d.switched);
    els.stamp.classList.add('fresh');
    setTimeout(() => els.stamp.classList.remove('fresh'), 1500);
  });

  es.addEventListener('docs', (e) => {
    const d = JSON.parse(e.data);
    paintDocList(d.docs, d.active);
  });

  es.addEventListener('gone', () => {
    els.article.hidden = true;
    els.empty.hidden = false;
    els.empty.querySelector('p').textContent = 'That file was deleted.';
  });

  es.onerror = () => {
    document.body.classList.add('disconnected');
    es.close();
    setTimeout(connect, 1500);
  };
}

function tick() {
  if (mtime) els.stamp.textContent = 'updated ' + relTime(mtime);
}
setInterval(tick, 10000);

document.addEventListener('keydown', (e) => {
  if (e.key === '\\' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    els.app.classList.toggle('no-rail');
  }
  if (e.key === 'r' && (e.metaKey || e.ctrlKey)) {
    e.preventDefault();
    refresh(false);
  }
});

refresh(true).catch(() => {});
fetch('/docs')
  .then((r) => r.json())
  .then((d) => paintDocList(d.docs, d.active))
  .catch(() => {});
connect();
