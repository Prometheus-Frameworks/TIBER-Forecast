#!/usr/bin/env bash
# Reproduce the any-week shadow experiment from the retained inputs.
# Usage (from the repository root):
#   bash docs/reports/evidence/any-week-shadow-2026-11-10/reproduce.sh [WORKDIR]
# Writes only inside WORKDIR (default: a new temp dir). Needs python3 + requirements.txt. No network.
set -euo pipefail
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
WORK="${1:-$(mktemp -d)}"
mkdir -p "$WORK/raw" "$WORK/r1" "$WORK/r0" "$WORK/inspection"
echo "== 1. unpack retained inputs and verify raw SHA-256"
(cd "$HERE/inputs" && sha256sum -c --quiet GZ.sha256)
for f in "$HERE"/inputs/*.csv.gz; do gzip -dc "$f" > "$WORK/raw/$(basename "${f%.gz}")"; done
(cd "$WORK/raw" && sha256sum -c --quiet "$HERE/inputs/RAW.sha256")
echo "== 2. re-run the as-run script (r1) and compare bytes with the preserved outputs"
python3 -I "$HERE/original/as-run-r1/shadow.py" "$WORK/raw" "$WORK/r1" > "$WORK/r1/stdout.txt"
for f in shadow_results.json shadow_week10_forecast.csv; do
  cmp "$WORK/r1/$f" "$HERE/original/as-run-r1/$f" && echo "   identical: $f"
done
python3 -I "$HERE/original/as-run-r1/blocker.py" "$WORK/raw" > "$WORK/r1/blocker_stdout.txt"
cmp "$WORK/r1/blocker_stdout.txt" "$HERE/original/as-run-r1/blocker_stdout.txt" && echo "   identical: blocker_stdout.txt"
echo "== 3. re-run the reconstructed first revision (r0) and compare with its retained regeneration"
python3 -I "$HERE/original/r0-reconstructed/shadow_r0.py" "$WORK/raw" "$WORK/r0" > "$WORK/r0/stdout.txt"
for f in shadow_results.json shadow_week10_forecast.csv; do
  cmp "$WORK/r0/$f" "$HERE/original/r0-reconstructed/$f" && echo "   identical: $f"
done
echo "== 4. inspection addendum (same fit, asserted equal to r1; adds per-player rows, metrics, Hodge arms)"
python3 -I "$HERE/inspection/inspect_shadow.py" "$WORK/raw" "$HERE/original/as-run-r1" "$WORK/inspection" > "$WORK/inspection/stdout.txt"
(cd "$WORK/inspection" && sha256sum -c --quiet "$HERE/inspection/OUTPUTS.sha256") && echo "   identical: inspection outputs"
echo "OK  workdir: $WORK"
