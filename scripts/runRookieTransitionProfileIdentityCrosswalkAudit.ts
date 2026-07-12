/**
 * Lane A identity-resolution audit CLI (Forecast #158): validates the committed governed identity
 * crosswalk (`data/experiments/rookieTransitionProfile/...`) against the committed
 * rookie_transition_profile_v0.2.0 mirror's locked source population, using the pure fail-closed
 * validator in `src/rehearsal/rookieTransitionProfileIdentityCrosswalk.ts`, then prints the audit
 * accounting (status counts, evidence-class counts, identity-coverage-dependency counts, and the
 * per-status row lists) and exactly one required decision.
 *
 * Read-only: this script never writes, refreshes, or repairs anything. A validation failure exits
 * non-zero with every collected error -- fail-closed, never best-effort.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { MIRROR_JSON_PATH } from '../src/rehearsal/rookieTransitionProfileMirror.js';
import {
  IDENTITY_CROSSWALK_PATH,
  validateRookieTransitionProfileIdentityCrosswalk,
  type ArchivedCitation,
  type IdentityCrosswalkArtifact,
} from '../src/rehearsal/rookieTransitionProfileIdentityCrosswalk.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repoPath = (rel: string): string => path.join(REPO_ROOT, rel);

/**
 * Archived-evidence resolver (design §3.2/§12): only archives committed to THIS repository can be
 * reproduced locally, and only when the archived bytes' SHA-256 matches the citation exactly.
 * Anything else (foreign repo, missing file, hash mismatch) returns null and fails the row closed.
 */
const resolveArchivedEvidence = (citation: ArchivedCitation): string | null => {
  if (citation.repo !== 'Prometheus-Frameworks/TIBER-Forecast') return null;
  try {
    const bytes = readFileSync(repoPath(citation.path));
    const digest = createHash('sha256').update(bytes).digest('hex');
    return digest === citation.sha256 ? bytes.toString('utf-8') : null;
  } catch {
    return null;
  }
};

const mirror = JSON.parse(readFileSync(repoPath(MIRROR_JSON_PATH), 'utf-8')) as { rows: Array<{ player_id: string }> };
const lockedSourcePlayerIds = mirror.rows.map((r) => r.player_id);

const artifact = JSON.parse(readFileSync(repoPath(IDENTITY_CROSSWALK_PATH), 'utf-8')) as IdentityCrosswalkArtifact;

const result = validateRookieTransitionProfileIdentityCrosswalk(artifact, lockedSourcePlayerIds, resolveArchivedEvidence);

console.log('rookie_transition_profile_v0 Forecast identity crosswalk audit (TIBER-Forecast#158)');
console.log(`artifact: ${IDENTITY_CROSSWALK_PATH}`);
console.log(`valid: ${result.valid}`);
console.log(`status_counts: ${JSON.stringify(result.statusCounts)}`);
console.log(`evidence_class_counts: ${JSON.stringify(result.evidenceClassCounts)}`);
console.log(`identity_coverage_dependency_counts: ${JSON.stringify(result.identityCoverageDependencyCounts)}`);

for (const status of ['unresolved', 'conflicting_evidence', 'blocked'] as const) {
  const ids = artifact.rows.filter((r) => r.resolution_status === status).map((r) => r.source_player_id);
  console.log(`${status} rows (${ids.length}): ${ids.length === 0 ? 'none' : ids.join(', ')}`);
}

if (!result.valid) {
  console.error(`\nvalidation errors (${result.errors.length}):`);
  for (const error of result.errors) console.error(`- ${error}`);
}

console.log(`\ndecision: ${result.decision}`);
process.exit(result.valid ? 0 : 1);
