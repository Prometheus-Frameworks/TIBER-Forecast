/**
 * Atomic directory-level commit for the rookie_transition_profile_v0.2.0 Forecast mirror (#151,
 * PR #152 review). Unlike the verifier module (`rookieTransitionProfileMirror.ts`), this module
 * DOES perform file I/O -- but every I/O primitive is an injectable parameter (defaulting to the
 * real `node:fs` calls) so tests can exercise real temporary directories on disk while forcing a
 * specific step to fail, to prove the rollback path without faking the whole filesystem.
 *
 * PR #152's review found that renaming each of the four files into place one at a time was not a
 * transaction across the set: a failure between renames 1 and 2 could leave a mixed generation
 * (some new files, some old). This module instead commits the mirror as a single DIRECTORY swap:
 *
 *   1. stage all files into a sibling temporary directory;
 *   2. verify the staged directory contains exactly the expected files with correct hashes;
 *   3. if a mirror directory already exists, rename it to a sibling backup directory (atomic);
 *   4. rename the staged directory into the final mirror path (atomic);
 *   5. on any CAUGHT failure at steps 3-4, roll back: restore the backup (if one was taken) and
 *      remove any partially-written final directory, then remove staging debris;
 *   6. on success, remove the backup directory.
 *
 * Each individual swap (steps 3 and 4) is a single `renameSync`, atomic on one filesystem. This
 * module does NOT claim immunity to uncatchable process termination (SIGKILL) or power loss
 * between steps 3 and 4 -- that residual window is inherent to any multi-step filesystem
 * transaction without OS/filesystem-level transactional support, and nothing here claims otherwise.
 */

import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export interface MirrorFileToCommit {
  filename: string;
  contents: Buffer | string;
  expectedSha256: string;
}

export interface CommitIo {
  existsSync: typeof existsSync;
  mkdirSync: typeof mkdirSync;
  writeFileSync: typeof writeFileSync;
  renameSync: typeof renameSync;
  rmSync: typeof rmSync;
  readdirSync: typeof readdirSync;
  readFileSync: typeof readFileSync;
}

export const REAL_COMMIT_IO: CommitIo = { existsSync, mkdirSync, writeFileSync, renameSync, rmSync, readdirSync, readFileSync };

export interface CommitResult {
  committed: boolean;
  rolledBack: boolean;
  error?: string;
}

const safeRemoveDir = (io: CommitIo, dirAbs: string): void => {
  try {
    if (io.existsSync(dirAbs)) io.rmSync(dirAbs, { recursive: true, force: true });
  } catch {
    // best-effort cleanup only; never allowed to mask the real result
  }
};

/**
 * Commits `files` into `mirrorDirAbs` as a single atomic directory swap. `uniqueSuffix` names the
 * sibling staging/backup directories (`<mirrorDirAbs>.staging-<suffix>` /
 * `<mirrorDirAbs>.backup-<suffix>`) -- callers should pass something collision-resistant (pid +
 * timestamp in production; a fixed test name is fine in tests). `io` defaults to real `node:fs`
 * calls; tests inject a wrapped `renameSync` to force a failure at a specific step.
 */
export const commitMirrorDirectoryAtomically = (
  mirrorDirAbs: string,
  files: MirrorFileToCommit[],
  sha256: (bytes: Buffer) => string,
  uniqueSuffix: string,
  io: CommitIo = REAL_COMMIT_IO,
): CommitResult => {
  const stagingDirAbs = `${mirrorDirAbs}.staging-${uniqueSuffix}`;
  const backupDirAbs = `${mirrorDirAbs}.backup-${uniqueSuffix}`;

  // Clear any stale staging/backup debris from a prior aborted run before starting.
  safeRemoveDir(io, stagingDirAbs);
  safeRemoveDir(io, backupDirAbs);

  // ---- 1. Stage --------------------------------------------------------------------------------
  try {
    io.mkdirSync(stagingDirAbs, { recursive: true });
    for (const file of files) io.writeFileSync(path.join(stagingDirAbs, file.filename), file.contents);
  } catch (error) {
    safeRemoveDir(io, stagingDirAbs);
    return { committed: false, rolledBack: false, error: `staging failed: ${(error as Error).message}` };
  }

  // ---- 2. Verify the staged directory before touching the real mirror ------------------------------
  const stagedNames = [...io.readdirSync(stagingDirAbs)].sort();
  const expectedNames = files.map((f) => f.filename).sort();
  const namesMatch = stagedNames.length === expectedNames.length && stagedNames.every((n, i) => n === expectedNames[i]);
  const hashesMatch = files.every((f) => sha256(io.readFileSync(path.join(stagingDirAbs, f.filename))) === f.expectedSha256);
  if (!namesMatch || !hashesMatch) {
    safeRemoveDir(io, stagingDirAbs);
    return {
      committed: false,
      rolledBack: false,
      error: `staged directory failed post-write verification (names match: ${namesMatch}, hashes match: ${hashesMatch})`,
    };
  }

  // ---- 3. Back up the existing mirror directory, if any ---------------------------------------------
  const hadExisting = io.existsSync(mirrorDirAbs);
  if (hadExisting) {
    try {
      io.renameSync(mirrorDirAbs, backupDirAbs);
    } catch (error) {
      safeRemoveDir(io, stagingDirAbs);
      return { committed: false, rolledBack: false, error: `could not back up existing mirror: ${(error as Error).message}` };
    }
  }

  // ---- 4. Swap the staged directory into place -------------------------------------------------------
  try {
    io.renameSync(stagingDirAbs, mirrorDirAbs);
  } catch (error) {
    // ---- 5. Roll back --------------------------------------------------------------------------------
    if (!hadExisting) {
      safeRemoveDir(io, stagingDirAbs);
      return { committed: false, rolledBack: false, error: `swap failed: ${(error as Error).message}` };
    }
    try {
      safeRemoveDir(io, mirrorDirAbs); // remove any partial final dir the failed rename may have left
      io.renameSync(backupDirAbs, mirrorDirAbs);
    } catch (rollbackError) {
      return {
        committed: false,
        rolledBack: false,
        error:
          `swap failed AND rollback failed -- manual recovery required: swap error=${(error as Error).message}; ` +
          `rollback error=${(rollbackError as Error).message}; backup remains at ${backupDirAbs}`,
      };
    }
    safeRemoveDir(io, stagingDirAbs);
    return { committed: false, rolledBack: true, error: `swap failed, rolled back to the previous mirror: ${(error as Error).message}` };
  }

  // ---- 6. Success: remove the backup -----------------------------------------------------------------
  if (hadExisting) safeRemoveDir(io, backupDirAbs);
  return { committed: true, rolledBack: false };
};
