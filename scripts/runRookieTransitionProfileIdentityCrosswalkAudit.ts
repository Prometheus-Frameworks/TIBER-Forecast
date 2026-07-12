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

import { execFileSync } from 'node:child_process';
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
 * Every repo this multi-repo project's session has locally available, keyed by its full name.
 * Forecast's own §3.2 evidence is expected to live here (Forecast archives its own supporting
 * evidence); a §3.3 governed artifact is expected to live in whichever OTHER repo actually governs
 * it (e.g. TIBER-Data) -- Forecast may consume it, never re-host it under its own repo (design §3.3).
 * A repo not in this map (or not present in this environment) fails closed to null, never a silent
 * partial check.
 */
const KNOWN_REPO_CHECKOUTS: Record<string, string> = {
  'Prometheus-Frameworks/TIBER-Forecast': REPO_ROOT,
  'Prometheus-Frameworks/TIBER-Data': path.resolve(REPO_ROOT, '../TIBER-Data'),
  'Prometheus-Frameworks/TIBER-Rookies': path.resolve(REPO_ROOT, '../TIBER-Rookies'),
  'Prometheus-Frameworks/TIBER-Teamstate': path.resolve(REPO_ROOT, '../TIBER-Teamstate'),
};

/**
 * Archived-evidence resolver (design §3.2/§3.3/§12): reads the EXACT pinned commit's content via
 * `git show <commit>:<path>` in that repo's local checkout -- never the current working tree, so a
 * citation stays reproducible even after the named repo moves past that commit. Recomputes SHA-256
 * and only returns content on an exact match. An unknown repo, an unfetched/missing commit, or a
 * hash mismatch all fail closed to null.
 *
 * Residual limitation, stated honestly rather than overclaimed: this depends on the cited repo
 * being a local sibling checkout of the running environment (true in this multi-repo session, per
 * `KNOWN_REPO_CHECKOUTS`), which a single-repo CI checkout of TIBER-Forecast alone would not
 * provide. Until CI provisions those sibling checkouts (or a different fetch mechanism is added),
 * a real cross-repo §3.3 citation would fail closed there too -- correctly inert, never a false pass.
 */
const resolveArchivedEvidence = (citation: ArchivedCitation): string | null => {
  const checkoutDir = KNOWN_REPO_CHECKOUTS[citation.repo];
  if (checkoutDir === undefined) return null;
  try {
    const bytes = execFileSync('git', ['show', `${citation.commit}:${citation.path}`], {
      cwd: checkoutDir,
      maxBuffer: 10 * 1024 * 1024,
    });
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
console.log(`verified_blocked_count: ${result.verifiedBlockedCount} / blocked: ${result.statusCounts.blocked}`);

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
