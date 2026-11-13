#!/usr/bin/env bash
# Negative tests for reproduce.sh.
#
# Each case copies the whole evidence folder to an isolated temp dir, alters ONE thing in the copy,
# runs the copy's reproduce.sh and requires: non-zero exit, a "FAIL:" line, and no final "OK" line.
# Two positive controls require exit 0 and the "OK" line. The preserved originals are never modified.
#
# Usage:  bash docs/reports/evidence/any-week-shadow-2026-11-10/verification/verify_negative.sh
set -uo pipefail

SRC="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ROOT="$(mktemp -d)"
BEFORE="$(cd "$SRC" && find . -type f ! -path './verification/*' -print0 | sort -z | xargs -0 sha256sum | sha256sum)"
pass=0
bad=0

fresh() {  # fresh NAME -> prints path of a new isolated copy
  local d="$ROOT/$1"
  mkdir -p "$d"
  cp -r "$SRC"/. "$d/evidence"
  echo "$d/evidence"
}

resha() {  # resha DIR FILE NAME -- rewrite the one line for NAME in checksum FILE inside DIR
  (cd "$1" && h="$(sha256sum "$3" | awk '{print $1}')" && sed -i "s|^[0-9a-f]\{64\}  $3\$|$h  $3|" "$2")
}

expect() {  # expect fail|ok NAME EVIDENCE_COPY
  local want="$1" name="$2" ev="$3" log="$ROOT/$2/log.txt" rc
  bash "$ev/reproduce.sh" "$ROOT/$name/work" > "$log" 2>&1
  rc=$?
  local has_ok=no has_fail=no
  grep -q '^OK ' "$log" && has_ok=yes
  grep -q '^FAIL: ' "$log" && has_fail=yes
  local verdict=UNEXPECTED
  if [ "$want" = fail ] && [ "$rc" -ne 0 ] && [ "$has_ok" = no ] && [ "$has_fail" = yes ]; then verdict=DETECTED; fi
  if [ "$want" = ok ] && [ "$rc" -eq 0 ] && [ "$has_ok" = yes ] && [ "$has_fail" = no ]; then verdict=PASSED; fi
  if [ "$verdict" = UNEXPECTED ]; then bad=$((bad + 1)); else pass=$((pass + 1)); fi
  printf '%-10s exit=%-3s final_OK=%-3s  %s\n' "$verdict" "$rc" "$has_ok" "$name"
  if [ "$want" = fail ]; then
    printf '             %s\n' "$(grep '^FAIL: ' "$log" | head -1)"
  else
    printf '             %s\n' "$(grep '^OK ' "$log" | head -1 | sed "s|workdir: .*|workdir: <temp>|")"
  fi
}

append_byte() { printf 'X' >> "$1"; }

echo "python $(python3 -c 'import sys;print(sys.version.split()[0])') pandas $(python3 -c 'import pandas;print(pandas.__version__)') numpy $(python3 -c 'import numpy;print(numpy.__version__)')"
echo

# ---- positive controls
ev="$(fresh P1_untouched_copy)"; expect ok P1_untouched_copy "$ev"

# compression-only difference: same CSV, different gzip level in the regenerating script copy
ev="$(fresh P2_regenerated_gzip_bytes_differ_contents_same)"
sed -i 's/compresslevel=9/compresslevel=1/' "$ev/inspection/inspect_shadow.py"
expect ok P2_regenerated_gzip_bytes_differ_contents_same "$ev"

# ---- inputs
ev="$(fresh N01_input_gzip_altered)"; append_byte "$ev/inputs/games.csv.gz"; expect fail N01_input_gzip_altered "$ev"
ev="$(fresh N02_raw_hash_list_altered)"; sed -i '1s/^\(.\{5\}\).\{4\}/\10000/' "$ev/inputs/RAW.sha256"; expect fail N02_raw_hash_list_altered "$ev"

# ---- expected outputs of the as-run script
ev="$(fresh N03_expected_r1_week10_forecast_altered)"; sed -i '2s/$/0/' "$ev/original/as-run-r1/shadow_week10_forecast.csv"; expect fail N03_expected_r1_week10_forecast_altered "$ev"
ev="$(fresh N04_expected_r1_results_altered)"; sed -i '0,/2.55/s//2.56/' "$ev/original/as-run-r1/shadow_results.json"; expect fail N04_expected_r1_results_altered "$ev"
ev="$(fresh N05_expected_r1_blocker_stdout_altered)"; sed -i '1s/Hodge/Hodges/' "$ev/original/as-run-r1/blocker_stdout.txt"; expect fail N05_expected_r1_blocker_stdout_altered "$ev"
ev="$(fresh N06_expected_r1_forecast_missing)"; rm "$ev/original/as-run-r1/shadow_week10_forecast.csv"; expect fail N06_expected_r1_forecast_missing "$ev"

# ---- expected outputs of the reconstructed first revision
ev="$(fresh N07_expected_r0_week10_forecast_altered)"; sed -i '2s/$/0/' "$ev/original/r0-reconstructed/shadow_week10_forecast.csv"; expect fail N07_expected_r0_week10_forecast_altered "$ev"
ev="$(fresh N08_expected_r0_results_altered)"; append_byte "$ev/original/r0-reconstructed/shadow_results.json"; expect fail N08_expected_r0_results_altered "$ev"

# ---- scripts that fail to run
ev="$(fresh N09_r1_script_exits_nonzero)"; sed -i '1i raise SystemExit(3)' "$ev/original/as-run-r1/shadow.py"; expect fail N09_r1_script_exits_nonzero "$ev"
ev="$(fresh N10_inspection_script_exits_nonzero)"; sed -i '1i raise SystemExit(3)' "$ev/inspection/inspect_shadow.py"; expect fail N10_inspection_script_exits_nonzero "$ev"
ev="$(fresh N11_inspection_internal_assertion_fails)"; sed -i 's/^assert k == r1\[/assert k != r1[/' "$ev/inspection/inspect_shadow.py"; expect fail N11_inspection_internal_assertion_fails "$ev"

# ---- retained inspection outputs
ev="$(fresh N12_retained_metrics_altered_hash_list_untouched)"; append_byte "$ev/inspection/metrics.json"; expect fail N12_retained_metrics_altered_hash_list_untouched "$ev"
ev="$(fresh N13_retained_metrics_altered_hash_list_updated)"; append_byte "$ev/inspection/metrics.json"; resha "$ev/inspection" OUTPUTS.sha256 metrics.json; expect fail N13_retained_metrics_altered_hash_list_updated "$ev"
ev="$(fresh N14_outputs_hash_list_altered)"; sed -i '1s/^\(.\{5\}\).\{4\}/\10000/' "$ev/inspection/OUTPUTS.sha256"; expect fail N14_outputs_hash_list_altered "$ev"

# ---- changed CSV contents inside a VALID gzip container
alter_csv_in_gzip() {  # change one outcome value, keep a well-formed gzip
  local gz="$1/inspection/predictions_and_outcomes.csv.gz"
  gzip -dc "$gz" | sed '2s/$/1/' | gzip -n -9 > "$gz.new" && mv "$gz.new" "$gz" && gzip -t "$gz"
}
ev="$(fresh N15_csv_in_gzip_altered_hash_lists_untouched)"; alter_csv_in_gzip "$ev"; expect fail N15_csv_in_gzip_altered_hash_lists_untouched "$ev"
ev="$(fresh N16_csv_in_gzip_altered_gzip_hash_updated)"; alter_csv_in_gzip "$ev"; resha "$ev/inspection" OUTPUTS.sha256 predictions_and_outcomes.csv.gz; expect fail N16_csv_in_gzip_altered_gzip_hash_updated "$ev"
ev="$(fresh N17_csv_in_gzip_altered_both_hashes_updated)"; alter_csv_in_gzip "$ev"; resha "$ev/inspection" OUTPUTS.sha256 predictions_and_outcomes.csv.gz
gzip -dc "$ev/inspection/predictions_and_outcomes.csv.gz" | sha256sum | awk '{print $1"  predictions_and_outcomes.csv"}' > "$ev/inspection/PREDICTIONS_CSV.sha256"
expect fail N17_csv_in_gzip_altered_both_hashes_updated "$ev"
ev="$(fresh N18_retained_gzip_truncated_hash_updated)"; head -c 5000 "$ev/inspection/predictions_and_outcomes.csv.gz" > "$ev/inspection/t" && mv "$ev/inspection/t" "$ev/inspection/predictions_and_outcomes.csv.gz"; resha "$ev/inspection" OUTPUTS.sha256 predictions_and_outcomes.csv.gz; expect fail N18_retained_gzip_truncated_hash_updated "$ev"

# ---- regenerated contents differ from retained (script copy changed to emit different CSV values)
ev="$(fresh N19_regenerated_csv_contents_differ)"; sed -i "s/pred\[c\] = pred\[c\].round(6)/pred[c] = pred[c].round(5)/" "$ev/inspection/inspect_shadow.py"; expect fail N19_regenerated_csv_contents_differ "$ev"

echo
AFTER="$(cd "$SRC" && find . -type f ! -path './verification/*' -print0 | sort -z | xargs -0 sha256sum | sha256sum)"
if [ "$BEFORE" = "$AFTER" ]; then echo "preserved evidence folder unchanged by these tests: yes"; else echo "preserved evidence folder unchanged by these tests: NO"; bad=$((bad + 1)); fi
echo "cases behaving as required: $pass   unexpected: $bad"
rm -rf "$ROOT"
[ "$bad" -eq 0 ]
