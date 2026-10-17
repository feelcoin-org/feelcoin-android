#!/usr/bin/env bash
# Prepare official Feelcoin launcher icons for the Android release.
# Run from the repository root BEFORE packaging the APK.
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"
command -v curl >/dev/null || { echo "curl is required" >&2; exit 1; }
test -d node_modules/@tauri-apps/cli || { echo "Run npm ci first" >&2; exit 1; }
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
SOURCE="$TMP/feelcoin-logo-v2.png"
curl --fail --location --silent --show-error --retry 3   "https://feelcoin.org/assets/feelcoin-logo-v2.png" -o "$SOURCE"
# Verify PNG magic and nontrivial length before passing the asset to Tauri.
python3 - "$SOURCE" <<'PY'
from pathlib import Path
import sys
p=Path(sys.argv[1])
data=p.read_bytes()
assert data[:8]==b"\x89PNG\r\n\x1a\n" and len(data)>1024, "Invalid official logo PNG"
print("Verified official Feelcoin PNG; bytes:",len(data))
PY
npm run tauri -- icon "$SOURCE" --output src-tauri/icons
echo "Official Feelcoin Android launcher icons generated."
echo "Next: check src-tauri/icons/android, build signed APK and inspect installed launcher icon."
