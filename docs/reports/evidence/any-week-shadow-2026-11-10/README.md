# any-week-shadow-2026-11-10 — evidence folder

**Shadow experiment evidence. Not an admitted source, not a Forecast run, not a consumer artifact.**
Report: [`../../any-week-shadow-candidate-2026-11-10.md`](../../any-week-shadow-candidate-2026-11-10.md)

| Path | What it is |
|---|---|
| `manifest.json` | Sources, retrieval times, hashes, run times, Week 10 freeze record |
| `inputs/*.csv.gz` | The exact bytes the run read (gzip of the raw assets); `RAW.sha256`, `GZ.sha256` |
| `original/as-run-r1/` | Script, results and Week 10 file exactly as delivered; `blocker.py` and its regenerated stdout |
| `original/r0-reconstructed/` | First script revision rebuilt from the session record, with its regenerated outputs |
| `inspection/inspect_shadow.py` | Addendum: same fit (asserted equal to r1), adds per-player rows, metrics, gate assessment, Hodge arms |
| `inspection/*` | Its outputs; `OUTPUTS.sha256` |
| `inspection/PREDICTIONS_CSV.sha256` | SHA-256 of the CSV inside the retained predictions gzip |
| `inputs/ATTRIBUTION.md`, `inputs/provider-licence/` | nflverse attribution, CC BY 4.0 links, pinned provider licence record |
| `reproduce.sh` | One command to verify everything above; every required check is fatal |
| `verification/verify_negative.sh`, `verification/negative_tests_2026-11-10.log` | Negative tests on isolated altered copies, and their recorded output |
| `requirements.txt` | Python package versions used |

```bash
python3 -m pip install -r requirements.txt
bash reproduce.sh            # from anywhere; no network; writes to a temp dir
bash verification/verify_negative.sh   # optional; about 4 minutes
```

Python is used here because the experiment was run in Python. Nothing in `src/`, `scripts/`, `tests/` or `package.json` references this folder.

What "reproduced" means here: r1, r0 and nine inspection outputs regenerate byte for byte; the predictions file regenerates byte for byte **as CSV contents**. Its gzip container bytes depend on the Python/zlib build and are reported, not required (identical under Python 3.13.18; different under 3.12.14).

Week 10 scoring rules, fixed before kickoff: [`../../any-week-shadow-week10-scoring-protocol-2026-11-10.md`](../../any-week-shadow-week10-scoring-protocol-2026-11-10.md).
