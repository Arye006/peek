#!/usr/bin/env bash
# Regenerates vendor/ from pinned upstream releases.
#
# peek ships with no runtime dependencies: everything it needs is a committed
# single file. This script is the only thing that touches vendor/, and it is run
# by a maintainer at release time — never on a user's machine.
set -euo pipefail

cd "$(dirname "${BASH_SOURCE[0]}")/.."

MARKED_VERSION="12.0.2"
HIGHLIGHT_VERSION="11.9.0"
MERMAID_VERSION="10.9.1"

TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fetch() { curl -sSfL -o "$2" "$1"; echo "  $(basename "$2")  $(du -h "$2" | cut -f1)"; }

echo "peek: vendoring dependencies"

# marked — must be lib/marked.cjs. The .min.js and .umd.js builds are browser
# bundles that do not export the Marked class under Node's require().
fetch "https://registry.npmjs.org/marked/-/marked-${MARKED_VERSION}.tgz" "$TMP/marked.tgz"
tar -xzf "$TMP/marked.tgz" -C "$TMP"
cp "$TMP/package/lib/marked.cjs" vendor/marked.cjs
cp "$TMP/package/LICENSE.md" vendor/LICENSE.marked.md
echo "  marked.cjs  $(du -h vendor/marked.cjs | cut -f1)"

# highlight.js — the npm package has no single-file build, but the cdnjs bundle
# is UMD and loads under both Node and the browser.
fetch "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/${HIGHLIGHT_VERSION}/highlight.min.js" vendor/highlight.min.js
fetch "https://raw.githubusercontent.com/highlightjs/highlight.js/${HIGHLIGHT_VERSION}/LICENSE" vendor/LICENSE.highlight.txt

# mermaid — browser only, loaded lazily by the page when a diagram is present.
fetch "https://cdn.jsdelivr.net/npm/mermaid@${MERMAID_VERSION}/dist/mermaid.min.js" vendor/mermaid.min.js
fetch "https://raw.githubusercontent.com/mermaid-js/mermaid/v${MERMAID_VERSION}/LICENSE" vendor/LICENSE.mermaid.txt

cat > vendor/THIRD-PARTY.md <<EOF
# Third-party code

peek vendors these libraries as single files so that installing the plugin needs
no package manager and no network access. Regenerate with \`tools/vendor.sh\`.

| Library | Version | Licence | Runs in |
|---|---|---|---|
| [marked](https://github.com/markedjs/marked) | ${MARKED_VERSION} | MIT | Node |
| [highlight.js](https://github.com/highlightjs/highlight.js) | ${HIGHLIGHT_VERSION} | BSD-3-Clause | Node |
| [mermaid](https://github.com/mermaid-js/mermaid) | ${MERMAID_VERSION} | MIT | browser |

Full licence texts sit beside the bundles in this directory.
EOF

echo "peek: vendor/ is up to date"
echo "note: vendor/*.d.ts describe only what peek calls — if an upstream API"
echo "      changed, update them and re-run \`npm run typecheck\`"
