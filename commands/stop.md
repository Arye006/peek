---
allowed-tools: Bash(node:*)
description: Close the peek preview window and shut its server down
---

!`node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" stop`

Confirm in one line. Note that the window will reopen automatically the next
time a plan-shaped markdown file is written, unless the user sets
`"enabled": false` in `~/.claude/peek/config.json`.
