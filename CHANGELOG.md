# Changelog

All notable changes to peek. This project follows [semantic versioning](https://semver.org).

## 1.0.1

### Fixed

- The preview window sometimes did not open. peek treated a live browser process as proof of
  a live window, but closing the window on macOS leaves Chrome running with nothing on screen —
  from then on every open reported "already open" and nothing appeared. Whether a window exists
  is now asked of the server, which knows how many pages hold its event stream open.
- Two windows could open at once when parallel tool calls fired parallel hooks. Launching now
  takes a lock; the runs that lose it wait for the window already on its way.
- Two servers could start from the same race, leaving the window talking to one and the CLI
  writing to the other, so the preview silently stopped updating. A server that finds a twin
  already on the port now steps aside.
- `peek stop` left the window open when its recorded pid belonged to a launcher process that
  Chrome had already discarded. It now closes whatever is running out of peek's profile.
- pids are checked against the process command line before being signalled, so a recycled pid
  cannot get an unrelated process killed.

All of the above was tested on macOS only. The root cause is macOS behaviour — Chrome outlives
its last window there — and the detection is platform-independent, since it asks the server how
many pages hold its event stream open rather than asking the operating system about processes.
The cleanup around it is not: `ours()` and `profilePids()` shell out to `ps`, so on Windows they
are no-ops and the old, pid-shaped behaviour stands. Linux is untested.

## 1.0.0

First release.

- Live preview of plan-shaped markdown in a dedicated Chromium app window, updating over SSE
  with scroll position preserved.
- `PostToolUse` hook that recognises plans by filename, path or heading, with every rule
  configurable in `~/.claude/peek/config.json`.
- `/peek:open`, `/peek:status` and `/peek:stop` commands.
- GFM tables and task lists, syntax highlighting across 36 languages, mermaid diagrams,
  light/dark following the system, print-to-PDF.
- Zero runtime dependencies: marked, highlight.js and mermaid are vendored as committed
  single files, so installing the plugin needs no package manager and no network.
- macOS, Linux and Windows browser discovery, falling back to the default browser when no
  Chromium-family browser is found.
- Silent no-op when Node is absent or older than 18, so the hook can never break a session.
