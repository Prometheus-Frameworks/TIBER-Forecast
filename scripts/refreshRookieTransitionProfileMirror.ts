/**
 * Refresh the inert Forecast mirror of TIBER-Rookies' promoted `rookie_transition_profile_v0.2.0`
 * (Forecast #151), as authorized by the #149/PR #150 consumption-design decision
 * `may_open_rookie_transition_profile_forecast_mirror_issue`.
 *
 * Reads a LOCAL TIBER-Rookies checkout (never fetches network/mutable `main`), verifies its
 * repository identity, commit, and every pinned artifact/source-manifest-input hash BEFORE writing
 * anything, then commits exactly four files under `data/fixtures/tiberRookies/` as a single atomic
 * directory swap: three byte-identical echoes of the upstream JSON/CSV/manifest and one additive
 * Forecast-owned provenance wrapper. Any failed check, or any failure during the commit itself,
 * leaves the previously committed mirror untouched (see
 * `src/rehearsal/rookieTransitionProfileMirrorCommit.ts` for the rollback guarantee and its limits).
 *
 *   npm run refresh:rookie-transition-profile-mirror -- \
 *     --source-root=/path/to/TIBER-Rookies \
 *     --mirror-refreshed-at=2026-07-11T00:00:00.000Z
 *
 * `--source-root` MUST be a real git checkout of TIBER-Rookies -- its repository identity and
 * commit are always resolved from `git`, never accepted as caller-asserted override flags (PR #152
 * review: spoofable identity flags would defeat the "verified, not claimed" requirement in #151).
 *
 * Optional:
 *   --mirror-dir=<path>   (default: data/fixtures/tiberRookies)
 *
 * Mirror refresh only: no transformation, filtering, adapter, feature extraction, experiment, model
 * import, or production binding. Exits non-zero unless the refresh decision is
 * `may_open_rookie_transition_profile_forecast_mirror_rehearsal_issue`.
 */

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  AUTHORIZED_MIRROR_FILENAMES,
  MIRROR_DIR,
  PINNED_SOURCE_MANIFEST_INPUT_HASHES,
  SOURCE_ARTIFACT_FILENAMES,
  SOURCE_PROMOTED_PATH,
  refreshRookieTransitionProfileMirror,
} from '../src/rehearsal/rookieTransitionProfileMirror.js';
import { commitMirrorDirectoryAtomically, type MirrorFileToCommit } from '../src/rehearsal/rookieTransitionProfileMirrorCommit.js';
import { resolveGitSourceIdentity } from '../src/rehearsal/rookieTransitionProfileMirrorSourceIdentity.js';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const argValue = (name: string): string | undefined =>
  process.argv.find((arg) => arg.startsWith(`--${name}=`))?.slice(`--${name}=`.length);

const sourceRoot = argValue('source-root') ?? process.env.TIBER_ROOKIES_SOURCE_ROOT;
const mirrorRefreshedAt = argValue('mirror-refreshed-at') ?? process.env.MIRROR_REFRESHED_AT;
const mirrorDir = argValue('mirror-dir') ?? MIRROR_DIR;

if (!sourceRoot || !mirrorRefreshedAt) {
  process.stderr.write(
    'Missing required arguments. Usage:\n' +
      '  npm run refresh:rookie-transition-profile-mirror -- --source-root=/path/to/TIBER-Rookies --mirror-refreshed-at=<ISO8601>\n' +
      '  (or env TIBER_ROOKIES_SOURCE_ROOT / MIRROR_REFRESHED_AT)\n',
  );
  process.exit(1);
}

// Repository identity and commit are ALWAYS resolved from the real git checkout -- there is no
// override flag. A non-git source root, or one with no origin remote, resolves to undefined and
// fails closed below rather than silently proceeding with an unverified identity.
const { sourceCommit, sourceRepo } = resolveGitSourceIdentity(sourceRoot);

if (!sourceCommit || !sourceRepo) {
  process.stderr.write(
    'FAIL CLOSED: could not resolve a verified git repository identity/commit at --source-root. It must be a real ' +
      'git checkout with an `origin` remote. No mirror was written.\n',
  );
  process.exit(1);
}

const promotedDir = path.join(sourceRoot, SOURCE_PROMOTED_PATH);
const readSourceFile = (relPath: string): Buffer => readFileSync(path.join(sourceRoot, relPath));

let jsonBytes: Buffer;
let csvBytes: Buffer;
let manifestBytes: Buffer;
const inputFileBytes: Record<string, Buffer> = {};
try {
  jsonBytes = readFileSync(path.join(promotedDir, SOURCE_ARTIFACT_FILENAMES.json));
  csvBytes = readFileSync(path.join(promotedDir, SOURCE_ARTIFACT_FILENAMES.csv));
  manifestBytes = readFileSync(path.join(promotedDir, SOURCE_ARTIFACT_FILENAMES.manifest));
  for (const relPath of Object.keys(PINNED_SOURCE_MANIFEST_INPUT_HASHES)) {
    inputFileBytes[relPath] = readSourceFile(relPath);
  }
} catch (error) {
  process.stderr.write(`FAIL CLOSED: could not read a required source file: ${(error as Error).message}\nNo mirror was written.\n`);
  process.exit(1);
}

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

const result = refreshRookieTransitionProfileMirror({
  sourceRepo,
  sourceCommit,
  jsonBytes,
  csvBytes,
  manifestBytes,
  inputFileBytes,
  mirrorRefreshedAt,
  sha256,
});

process.stderr.write(
  `source: ${sourceRepo}@${sourceCommit}\n` +
    `checks: ${result.checks.filter((c) => c.passed).length}/${result.checks.length} passed\n` +
    `status: ${result.status} -> ${result.decision}\n`,
);

if (result.status !== 'passed' || !result.files) {
  process.stderr.write(`${result.blocking_reasons.map((r) => `  - ${r}\n`).join('')}No mirror was written.\n`);
  process.exit(1);
}

const mirrorDirAbs = path.isAbsolute(mirrorDir) ? mirrorDir : path.join(REPO_ROOT, mirrorDir);
const [jsonFilename, csvFilename, manifestFilename, wrapperFilename] = AUTHORIZED_MIRROR_FILENAMES;
const wrapperJson = `${JSON.stringify(result.files.wrapper, null, 2)}\n`;

const filesToCommit: MirrorFileToCommit[] = [
  { filename: jsonFilename, contents: result.files.mirrorJson, expectedSha256: sha256(result.files.mirrorJson) },
  { filename: csvFilename, contents: result.files.mirrorCsv, expectedSha256: sha256(result.files.mirrorCsv) },
  { filename: manifestFilename, contents: result.files.mirrorManifest, expectedSha256: sha256(result.files.mirrorManifest) },
  { filename: wrapperFilename, contents: wrapperJson, expectedSha256: sha256(Buffer.from(wrapperJson, 'utf-8')) },
];

const commit = commitMirrorDirectoryAtomically(mirrorDirAbs, filesToCommit, sha256, `${process.pid}-${Date.now()}`);

if (!commit.committed) {
  process.stderr.write(
    `FAIL CLOSED: ${commit.error}\n` +
      (commit.rolledBack
        ? 'The previously committed mirror was restored.\n'
        : 'The previously committed mirror may require manual inspection -- see the error above.\n'),
  );
  process.exit(1);
}

process.stderr.write(
  `committed ${path.join(mirrorDirAbs, jsonFilename)}\n` +
    `committed ${path.join(mirrorDirAbs, csvFilename)}\n` +
    `committed ${path.join(mirrorDirAbs, manifestFilename)}\n` +
    `committed ${path.join(mirrorDirAbs, wrapperFilename)}\n`,
);

if (result.decision !== 'may_open_rookie_transition_profile_forecast_mirror_rehearsal_issue') {
  process.exit(1);
}
