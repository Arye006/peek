#!/bin/sh
# Wrapper around the PostToolUse hook.
#
# Claude Code ships as a native binary and does not require Node, so a user can
# perfectly well have Claude Code and no `node`. This hook fires on every file
# write, and erroring on each one would be far worse than doing nothing, so a
# missing interpreter is a silent no-op. Run any peek command by hand and you
# get a real error message instead.
command -v node >/dev/null 2>&1 || exit 0

ROOT="${CLAUDE_PLUGIN_ROOT:-$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)}"
exec node "$ROOT/hooks/plan-preview.js"
