# peek

**Claude Code writes a plan. peek puts it on screen.**

A Claude Code plugin that renders plan-shaped markdown into a dedicated, live-updating
window — not a terminal dump, not an IDE tab, not a browser tab lost among forty others.
When Claude edits the plan, the window updates in place and keeps your scroll position.

```
┌─ Documents ──┬──────────────────────────────────────────────┐
│ plan.md      │  Migration plan: user deletion service       │
│ api-spec.md  │  updated just now · 940 words · ▓▓▓░ 2/4     │
├─ Outline ────┼──────────────────────────────────────────────┤
│ Goals        │  ## Goals                                    │
│ Approach     │  ☑ Audit the current deletion paths          │
│   Rollout    │  ☑ Agree a retention window                  │
│ Risks        │  ☐ Ship the batched deleter                  │
└──────────────┴──────────────────────────────────────────────┘
```

## Install

```
/plugin marketplace add deBilla/peek
/plugin install peek@peek
```

That's the whole install. No `npm install`, no build step, no dependencies — peek vendors
everything it needs as committed single files, so the plugin works the moment it is cloned,
offline included.

## Use

**Automatically.** Whenever Claude writes or edits a markdown file that looks like a plan,
the window opens or refreshes. Ordinary markdown is left alone.

**On demand.**

```
/peek:open docs/plan.md    open or refresh the preview
/peek:status               server and window state
/peek:stop                 close the window, shut the server down
```

## In the window

| | |
|---|---|
| **Live reload** | The file is watched by directory, so the temp-file-rename that editors and Claude's `Write` both use is caught. Updates arrive over SSE with your scroll position preserved. |
| **Plan-aware header** | Task-list progress bar, word count, reading time, last-updated stamp. |
| **Outline** | Clickable heading tree with scroll-spy, plus a switcher for the last 12 documents you previewed. |
| **Real rendering** | GFM tables and task lists, syntax highlighting across 36 languages, mermaid diagrams. |
| **Light and dark** | Follows the system; `◐` cycles system → light → dark. |
| **`⌘P`** | Print, which on macOS means *Save as PDF*. |
| **`⌘\`** | Hide the sidebar. **`⌘R`** forces a re-render. |

## What counts as a plan

A file qualifies when it is `.md`/`.markdown`, at least 200 bytes, not excluded, and matches
any one of:

| Rule | Default |
|---|---|
| Filename contains | `plan`, `design`, `proposal`, `rfc`, `spec`, `roadmap`, `architecture`, `migration`, `implementation`, `todo`, `tasks`, `checklist` |
| Path contains | `/scratchpad/`, `/.claude/plans/`, `/docs/plans/` |
| An `#`/`##` heading in the first 4 KB matches | `plan\|proposal\|design\|rfc\|spec\|roadmap\|architecture\|migration\|implementation\|approach` |

Excluded whatever else matches: `README*`, `CHANGELOG*`, `LICENSE*`, `CONTRIBUTING*`,
`CLAUDE.md`, anything under `node_modules/`.

Every one of those lists lives in `~/.claude/peek/config.json`, written on first run. Edit it
and the next write picks up the change — no restart. `"enabled": false` mutes the hook without
uninstalling the plugin.

## Permissions and privacy

peek asks your operating system for nothing. It binds an HTTP server to `127.0.0.1`, serves
files strictly from the directories of documents you have opened, makes no network requests,
and collects nothing. The window runs in its own browser profile under
`~/.claude/peek/browser-profile`, so your everyday session is untouched. The server exits by
itself five minutes after you close the window.

One behaviour is opt-in because it *would* cost a permission: `"focusWindow": true` makes an
open window raise itself on every update, which needs AppleScript and so triggers macOS's
Automation prompt. Left off, the window updates quietly in the background.

## Requirements

Node 18+ (Claude Code already brings it) and a Chromium-family browser — Chrome, Chromium,
Brave, Edge or Vivaldi — for the dedicated-window mode. Without one, peek falls back to a tab
in your default browser. Tested on macOS and Linux; Windows paths are implemented but less
travelled, and bug reports are welcome.

## Without the plugin

peek is a plain Node program, so it works standalone:

```bash
git clone https://github.com/deBilla/peek && cd peek
node bin/peek docs/plan.md
ln -s "$PWD/bin/peek" ~/.local/bin/peek   # optional, puts `peek` on PATH
```

## How it works

| Piece | Role |
|---|---|
| `src/server.js` | Loopback HTTP server: renders the document, watches the file, pushes SSE updates |
| `src/render.js` | marked + highlight.js, with heading anchors, task counting and relative-path rewriting |
| `src/matcher.js` | Decides whether a written file is a plan worth showing |
| `src/window.js` | Finds a Chromium-family browser, launches it with `--app=` and an isolated profile |
| `src/cli.js` | Starts the server on demand, switches documents, manages the window |
| `hooks/plan-preview.js` | The `PostToolUse` hook — spawns detached and exits, so it never blocks a tool call |

## Contributing

```bash
node --test test/      # 27 tests, no setup required
./tools/vendor.sh      # refresh vendor/ from pinned upstream releases
```

The matcher is the part most worth tuning, and `test/matcher.test.js` is the place to argue
for a change: add the case you think should or shouldn't open a window.

Vendored dependencies, their versions and licences are listed in
[`vendor/THIRD-PARTY.md`](vendor/THIRD-PARTY.md).

## Licence

MIT — see [LICENSE](LICENSE).
