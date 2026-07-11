/**
 * Refresh the inert Forecast mirror of TIBER-Rookies' promoted `rookie_transition_profile_v0.2.0`
 * (Forecast #151), as authorized by the #149/PR #150 consumption-design decision
 * `may_open_rookie_transition_profile_forecast_mirror_issue`.
 *
 * Reads a LOCAL TIBER-Rookies checkout (never fetches network/mutable `main`), verifies its
 * repository identity, commit, and every pinned artifact/source-manifest-input hash BEFORE writing
 * anything, then writes exactly four files under `data/fixtures/tiberRookies/`: three byte-identical
 * echoes of the upstream JSON/CSV/manifest and one additive Forecast-owned provenance wrapper. Any
 * failed check aborts with no file written and the previously committed mirror left untouched.
 *
 *   npm run refresh:rookie-transition-profile-mirror -- \
 *     --source-root=/path/to/TIBER-Rookies \
 *     --mirror-refreshed-at=2026-07-11T00:00:00.000Z
 *
 * Optional overrides (mainly for tests against a non-git fixture directory):
 *   --source-commit=<sha>   (default: `git -C <source-root> rev-parse HEAD`)
 *   --source-repo=<owner/repo>   (default: parsed from `git -C <source-root> remote get-url origin`)
 *   --mirror-dir=<path>   (default: data/fixtures/tiberRookies)
 *
 * Mirror refresh only: no transformation, filtering, adapter, feature extraction, experiment, model
 * import, or production binding. Exits non-zero unless the refresh decision is
 * `may_open_rookie_transition_profile_forecast_mirror_rehearsal_issue`.
 */

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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

const gitOutput = (args: string[]): string | undefined => {
  try {
    return execFileSync('git', args, { cwd: sourceRoot, encoding: 'utf-8' }).trim();
  } catch {
    return undefined;
  }
};

const parseRepoSlug = (remoteUrl: string | undefined): string | undefined => {
  if (!remoteUrl) return undefined;
  const withoutGitSuffix = remoteUrl.replace(/\.git$/, '');
  const match = withoutGitSuffix.match(/[:/]([^/:]+\/[^/]+)$/);
  return match?.[1];
};

const sourceCommit = argValue('source-commit') ?? gitOutput(['rev-parse', 'HEAD']);
const sourceRepo = argValue('source-repo') ?? parseRepoSlug(gitOutput(['remote', 'get-url', 'origin']));

if (!sourceCommit || !sourceRepo) {
  process.stderr.write(
    'FAIL CLOSED: could not determine the source repository identity or commit. Pass --source-commit=... ' +
      '--source-repo=... explicitly, or point --source-root at a real git checkout. No mirror was written.\n',
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
if (!existsSync(mirrorDirAbs)) mkdirSync(mirrorDirAbs, { recursive: true });

const [jsonFilename, csvFilename, manifestFilename, wrapperFilename] = AUTHORIZED_MIRROR_FILENAMES;
const outJsonPath = path.join(mirrorDirAbs, jsonFilename);
const outCsvPath = path.join(mirrorDirAbs, csvFilename);
const outManifestPath = path.join(mirrorDirAbs, manifestFilename);
const outWrapperPath = path.join(mirrorDirAbs, wrapperFilename);

// Write only after every check has passed -- no partial refresh. All three payload files are
// byte-identical echoes of the verified upstream bytes; nothing is decoded, re-encoded, or reshaped.
writeFileSync(outJsonPath, result.files.mirrorJson);
writeFileSync(outCsvPath, result.files.mirrorCsv);
writeFileSync(outManifestPath, result.files.mirrorManifest);
writeFileSync(outWrapperPath, `${JSON.stringify(result.files.wrapper, null, 2)}\n`, 'utf-8');

process.stderr.write(`wrote ${outJsonPath}\nwrote ${outCsvPath}\nwrote ${outManifestPath}\nwrote ${outWrapperPath}\n`);

if (result.decision !== 'may_open_rookie_transition_profile_forecast_mirror_rehearsal_issue') {
  process.exit(1);
}
