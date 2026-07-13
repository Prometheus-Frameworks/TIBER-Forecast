/**
 * Lane B source-availability audit CLI (Forecast #160): validates the committed governed
 * availability-evidence artifact (`data/experiments/rookieTransitionProfile/...`) against the
 * committed rookie_transition_profile_v0.2.0 mirror's locked population and provenance wrapper, using
 * the pure fail-closed validator in `src/rehearsal/rookieTransitionProfileAvailabilityEvidence.ts`,
 * then prints the audit accounting (status counts overall and by field family) and exactly one
 * required decision.
 *
 * Read-only: this script never writes, refreshes, or repairs anything. A validation failure exits
 * non-zero with every collected error -- fail-closed, never best-effort.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MIRROR_DIR, MIRROR_CSV_PATH, MIRROR_JSON_PATH, MIRROR_MANIFEST_PATH, MIRROR_PROVENANCE_PATH } from '../src/rehearsal/rookieTransitionProfileMirror.js';
import {
  AVAILABILITY_EVIDENCE_PATH,
  FIELD_FAMILIES,
  validateRookieTransitionProfileAvailabilityEvidence,
  type AvailabilityEvidenceArtifact,
  type EvidenceCitation,
  type FieldFamily,
  type MirrorVerificationContext,
} from '../src/rehearsal/rookieTransitionProfileAvailabilityEvidence.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoPath = (rel: string): string => path.join(REPO_ROOT, rel);
const sha256OfBytes = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

/** Same multi-repo git-show resolver used by the Lane A CLI (independent implementation, same discipline). */
const KNOWN_REPO_CHECKOUTS: Record<string, string> = {
  'Prometheus-Frameworks/TIBER-Forecast': REPO_ROOT,
  'Prometheus-Frameworks/TIBER-Data': path.resolve(REPO_ROOT, '../TIBER-Data'),
  'Prometheus-Frameworks/TIBER-Rookies': path.resolve(REPO_ROOT, '../TIBER-Rookies'),
  'Prometheus-Frameworks/TIBER-Teamstate': path.resolve(REPO_ROOT, '../TIBER-Teamstate'),
};

const resolveArchivedEvidence = (citation: EvidenceCitation): string | null => {
  const checkoutDir = KNOWN_REPO_CHECKOUTS[citation.repo];
  if (checkoutDir === undefined) return null;
  try {
    const bytes = execFileSync('git', ['show', `${citation.commit}:${citation.path}`], {
      cwd: checkoutDir,
      maxBuffer: 10 * 1024 * 1024,
    });
    const digest = sha256OfBytes(bytes);
    return digest === citation.sha256 ? bytes.toString('utf-8') : null;
  } catch {
    return null;
  }
};

// ---- Build the real mirror-verification context (file I/O lives here; the validator stays pure) ----

const wrapperBytes = readFileSync(repoPath(MIRROR_PROVENANCE_PATH));
const wrapper = JSON.parse(wrapperBytes.toString('utf-8')) as MirrorVerificationContext['wrapper'];
const mirrorJsonBytes = readFileSync(repoPath(MIRROR_JSON_PATH));
const mirrorCsvBytes = readFileSync(repoPath(MIRROR_CSV_PATH));
const mirrorManifestBytes = readFileSync(repoPath(MIRROR_MANIFEST_PATH));
const mirrorJson = JSON.parse(mirrorJsonBytes.toString('utf-8')) as {
  rows: Array<{ player_id: string } & Record<FieldFamily, { value: unknown }>>;
};

const lockedSourcePlayerIds = mirrorJson.rows.map((r) => r.player_id);

const valuePresence: MirrorVerificationContext['valuePresence'] = {};
for (const row of mirrorJson.rows) {
  valuePresence[row.player_id] = Object.fromEntries(FIELD_FAMILIES.map((family) => [family, row[family].value !== null])) as Record<
    FieldFamily,
    boolean
  >;
}

const mirrorValueLiterals: MirrorVerificationContext['mirrorValueLiterals'] = {};
for (const row of mirrorJson.rows) {
  mirrorValueLiterals[row.player_id] = Object.fromEntries(
    FIELD_FAMILIES.map((family) => [family, row[family].value !== null ? JSON.stringify(row[family].value) : null]),
  ) as Record<FieldFamily, string | null>;
}

const mirrorContext: MirrorVerificationContext = {
  wrapper,
  wrapperSha256: sha256OfBytes(wrapperBytes),
  recomputedMirrorHashes: {
    mirror_json: sha256OfBytes(mirrorJsonBytes),
    mirror_csv: sha256OfBytes(mirrorCsvBytes),
    mirror_manifest: sha256OfBytes(mirrorManifestBytes),
  },
  actualMirrorDirFilenames: readdirSync(repoPath(MIRROR_DIR)),
  valuePresence,
  mirrorValueLiterals,
};

const artifact = JSON.parse(readFileSync(repoPath(AVAILABILITY_EVIDENCE_PATH), 'utf-8')) as AvailabilityEvidenceArtifact;

const result = validateRookieTransitionProfileAvailabilityEvidence(artifact, lockedSourcePlayerIds, mirrorContext, resolveArchivedEvidence);

console.log('rookie_transition_profile_v0 Forecast source-availability audit (TIBER-Forecast#160)');
console.log(`artifact: ${AVAILABILITY_EVIDENCE_PATH}`);
console.log(`valid: ${result.valid}`);
console.log(`status_counts: ${JSON.stringify(result.statusCounts)}`);
console.log(`status_counts_by_family: ${JSON.stringify(result.statusCountsByFamily)}`);

const unresolvedByFamily = FIELD_FAMILIES.map(
  (family) => `${family}: ${result.statusCountsByFamily[family].unresolved_no_availability_proof}`,
).join(', ');
console.log(`unresolved_no_availability_proof by family: ${unresolvedByFamily}`);

if (!result.valid) {
  console.error(`\nvalidation errors (${result.errors.length}):`);
  for (const error of result.errors) console.error(`- ${error}`);
}

console.log(`\ndecision: ${result.decision}`);
process.exit(result.valid ? 0 : 1);
