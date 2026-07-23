#!/usr/bin/env bash
# Download flag SVGs (one per country, by lowercase cca2) from flagcdn.com
# into assets/flags/. Reads the code list produced by build_data.py.
set -euo pipefail
cd "$(dirname "$0")/.."
list="scripts/cache/flags-list.txt"
out="assets/flags"
mkdir -p "$out"
[ -f "$list" ] || { echo "missing $list — run build_data.py first"; exit 1; }

echo "Downloading $(wc -l < "$list") flags ..."
while read -r code; do
  [ -z "$code" ] && continue
  printf '%s\0' "$code"
done < "$list" | xargs -0 -P 12 -I{} bash -c '
  code="{}"
  curl -sSL --fail -o "assets/flags/${code}.svg" "https://flagcdn.com/${code}.svg" \
    || echo "FAILED: ${code}"
'
echo "done: $(ls assets/flags/*.svg 2>/dev/null | wc -l) flags"
