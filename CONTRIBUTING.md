# Contributing to peek

Thanks for looking. peek is small on purpose — about 1,500 lines of plain JavaScript — so most
changes are easy to review, and the bar is mostly about keeping it that way.

## Getting set up

You need **Node 18 or newer**. That is all a user needs too, and it should stay that way.

```bash
git clone https://github.com/deBilla/peek && cd peek
node --test test/*.test.js   # the test suite, no setup required
npm install                  # only for the type checker
npm run typecheck            # tsc --noEmit over the sources
node bin/peek docs/plan.md   # run it standalone against any markdown file
```

To try your checkout as the real plugin inside Claude Code:

```
/plugin marketplace add /path/to/your/peek
/plugin install peek@peek
```

peek keeps its state in `~/.claude/peek/`. Set `PEEK_STATE_DIR` to point it somewhere else
while you experiment, which is what the tests do, so your real installation is never touched.

## The ground rules

These are the things a pull request will be checked against. CI enforces most of them.

**No runtime dependencies.** The plugin is installed by `git clone` with no package manager and
no network. `package.json` may only carry `devDependencies` (today: the type checker). If you
need a library in the page, vendor it as a single committed file through `tools/vendor.sh`,
pin the version, and add it to [`vendor/THIRD-PARTY.md`](vendor/THIRD-PARTY.md).

**No build step.** Sources are plain CommonJS, type-checked with JSDoc and `tsc --noEmit`. The
README explains why TypeScript sources are off the table; please don't add a `dist/`.

**Node 18 is the floor.** CI runs 18, 20 and 22 on Ubuntu and macOS. Avoid APIs newer than 18
unless they are feature-detected.

**The hook must never break a session.** `hooks/plan-preview.js` spawns detached and exits. It
must stay fast, never block a tool call, and stay silent when anything is missing — Node, a
browser, a config file. Errors belong in `~/.claude/peek/server.log` and `/peek:status`, not
in the user's terminal.

**Ask the operating system for nothing.** No new permission prompts by default. Anything that
needs one (like `focusWindow`) is opt-in through `~/.claude/peek/config.json`.

**Untrusted markdown stays untrusted.** The page is served under a strict CSP: own assets only,
no inline script, no outbound connections. Changes to `src/server.js`, `src/render.js` or
`src/shell.html` must not loosen it.

**Never signal a process you haven't proven is ours.** pids are recycled. Anything that kills
a process checks its command line against peek's browser profile first (see `ours()` in
`src/window.js`).

## Where things live

| Path | What it is |
|---|---|
| `src/matcher.js` | Decides whether a written file is a plan. The part most worth tuning. |
| `src/render.js` | marked + highlight.js, heading anchors, task counting, relative-path rewriting |
| `src/server.js` | Loopback HTTP server, file watching, SSE updates |
| `src/window.js` | Browser discovery, `--app=` launch, window lifecycle |
| `src/cli.js` | `peek` command: starts the server, switches documents, manages the window |
| `src/client.js`, `shell.html`, `theme.css` | The page itself |
| `hooks/` | The `PostToolUse` hook and its `sh` shim |
| `commands/` | `/peek:open`, `/peek:status`, `/peek:stop` |
| `tools/` | Vendoring and screenshot scripts; `tools/demo/` feeds the screenshots |
| `vendor/` | Committed upstream bundles, with hand-written `.d.ts` surfaces |

## Making a change

1. **Open an issue first** for anything bigger than a bug fix, so we can agree on the shape
   before you write it.
2. **Add a test.** Tests live in `test/*.test.js` and use `node:test`, nothing else.
   For matcher changes, add the filename or path you think should — or shouldn't — open a
   window; that test is the argument for the change.
3. **Run the checks** — `node --test test/*.test.js` and `npm run typecheck` — before pushing.
4. **Update the docs** when behaviour changes: the README for anything a user sees, and an
   entry under an *Unreleased* heading in `CHANGELOG.md`.
5. **If you touched the page**, regenerate the screenshots with `./tools/screenshot.sh`
   (headless Chrome, no screen-recording permission needed).

Write commit messages that say *why*, in the imperative: "Decide the window is open by asking
the server, not the process table" tells a future reader more than "fix window bug".

## Testing on your platform

peek is tested day to day on macOS. Linux and Windows reports are especially valuable — the
CHANGELOG is explicit about what has and hasn't been exercised there. When you file a bug,
include:

- OS and version, Node version (`node --version`) and browser
- the output of `/peek:status`
- the tail of `~/.claude/peek/server.log`
- the file path that did or didn't open a window, if it's a matcher question

## Releasing

Maintainers only. Bump the version in **both** `package.json` and `.claude-plugin/plugin.json`
(CI fails if they drift), and move the *Unreleased* changelog
entries under the new version. Installed copies only pick up a change once the version moves.

## Licence

By contributing you agree that your work is released under the [MIT licence](LICENSE).
