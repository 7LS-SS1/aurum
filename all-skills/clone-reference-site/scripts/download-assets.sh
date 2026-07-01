#!/usr/bin/env bash
# download-assets.sh — pull every CSS-referenced asset from the reference into ./img/
# Usage:  ./download-assets.sh <origin> [outdir]
#   <origin>  e.g. https://www.example.com   (no trailing slash)
#   [outdir]  recon out dir containing asset-paths.json (default: current dir)
set -euo pipefail
ORIGIN="${1:?usage: download-assets.sh <origin> [outdir]}"
DIR="${2:-.}"
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
mkdir -p "$DIR/img"

# read asset paths (array of "/img/x.png" style strings) from asset-paths.json
python3 - "$DIR/asset-paths.json" <<'PY' | while read -r p; do
import json,sys
print('\n'.join(json.load(open(sys.argv[1]))))
PY
  [ -z "$p" ] && continue
  fn=$(basename "$p")
  curl -sL -A "$UA" "$ORIGIN$p" -o "$DIR/img/$fn" && echo "  ✓ $fn"
done
echo "done -> $DIR/img/"
