---
allowed-tools: Bash(node:*)
argument-hint: [path/to/file.md]
description: Open a markdown file in the peek preview window
---

Open the preview window on the requested document.

!`node "${CLAUDE_PLUGIN_ROOT}/src/cli.js" open "$1"`

If `$1` is empty, no file was given: instead of guessing, look for the most
recently modified markdown file that reads like a plan in the current working
directory, tell the user which one you picked, and run the command again with
that path. If nothing plausible exists, say so and stop.

Report only the outcome in one line — the file now showing, or the error. Do not
summarise the document's contents; the user is about to read it in the window.
