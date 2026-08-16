#!/usr/bin/env bash
# Pull the full Austin Animal Center intake + outcome datasets as CSV.
# Public Socrata endpoints, no API token needed for this volume.
set -euo pipefail

DATA_DIR="$(cd "$(dirname "$0")/.." && pwd)/data"
mkdir -p "$DATA_DIR"

fetch() {
  local id="$1" name="$2"
  echo "[$(date -u +%H:%M:%S)] fetching $name ($id)..."
  curl -sS --fail --retry 3 --retry-delay 2 --max-time 900 \
    "https://data.austintexas.gov/resource/${id}.csv?\$limit=400000&\$order=animal_id" \
    -o "$DATA_DIR/${name}.csv"
  echo "[$(date -u +%H:%M:%S)] $name: $(wc -l < "$DATA_DIR/${name}.csv") lines, $(du -h "$DATA_DIR/${name}.csv" | cut -f1)"
}

fetch "wter-evkm" "intakes"
fetch "9t4d-g238" "outcomes"

echo "[$(date -u +%H:%M:%S)] done."
