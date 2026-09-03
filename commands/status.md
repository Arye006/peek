---
allowed-tools: Bash(node:*)
description: Show whether the peek server and preview window are running
---

!`node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" status`

Relay the output as-is. If it reports `not running`, mention that the window
opens on its own the next time a plan-shaped markdown file is written, and that
`/peek:open <file>` starts it immediately.
