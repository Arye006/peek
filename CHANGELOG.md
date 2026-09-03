# Changelog

All notable changes to peek. This project follows [semantic versioning](https://semver.org).

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
