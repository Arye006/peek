#!/usr/bin/env bash
# Regenerates the README screenshots from tools/demo/plan.md.
#
# Uses headless Chrome, so it needs no screen-recording permission and produces
# the same image on any machine. Run from the repo root: ./tools/screenshot.sh
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

CHROME="${CHROME:-/Applications/Google Chrome.app/Contents/MacOS/Google Chrome}"
[ -x "$CHROME" ] || { echo "set CHROME to a Chromium-family binary"; exit 1; }

PROFILE="$(mktemp -d)"
# The document path is visible in the screenshot, so the demo is staged somewhere
# that reads cleanly rather than wherever this checkout happens to live.
STAGE="$HOME/peek-demo/checkout"
trap 'rm -rf "$PROFILE" "$HOME/peek-demo"' EXIT

mkdir -p "$STAGE"
cp tools/demo/plan.md tools/demo/payments-rfc.md "$STAGE/"

# Restart so the document rail contains exactly these two, in this order.
node src/cli.js stop >/dev/null 2>&1 || true
node src/cli.js open "$STAGE/payments-rfc.md" --no-window >/dev/null
node src/cli.js open "$STAGE/plan.md" --no-window >/dev/null
PORT="$(node -e 'console.log(JSON.parse(require("fs").readFileSync(require("./src/config").statePath,"utf8")).port)')"

shoot() {
  local out="$1" theme="$2"
  rm -f "$out"
  "$CHROME" --headless=new --disable-gpu --hide-scrollbars \
    --user-data-dir="$PROFILE/$theme" \
    --window-size=1280,1000 \
    --screenshot="$out" "http://127.0.0.1:$PORT/?theme=$theme" >/dev/null 2>&1 &
  local pid=$!
  for _ in $(seq 1 25); do [ -f "$out" ] && break; sleep 1; done
  kill "$pid" 2>/dev/null || true
  wait "$pid" 2>/dev/null || true
  [ -f "$out" ] || { echo "failed to capture $out"; exit 1; }
  echo "  $out  $(du -h "$out" | cut -f1)"
}

echo "peek: capturing screenshots"
shoot "$PWD/docs/preview-light.png" light
shoot "$PWD/docs/preview-dark.png" dark
node src/cli.js stop >/dev/null 2>&1 || true
echo "peek: done"
