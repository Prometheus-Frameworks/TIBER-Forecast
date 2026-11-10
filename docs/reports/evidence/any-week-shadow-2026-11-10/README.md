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
| `reproduce.sh` | One command to verify everything above |
| `requirements.txt` | Python package versions used |

```bash
python3 -m pip install -r requirements.txt
bash reproduce.sh            # from anywhere; no network; writes to a temp dir
```

Python is used here because the experiment was run in Python. Nothing in `src/`, `scripts/`, `tests/` or `package.json` references this folder.
