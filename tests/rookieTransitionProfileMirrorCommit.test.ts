/**
 * Integration-level tests for the atomic directory commit (#151, PR #152 review): real temporary
 * directories on disk, with a wrapped `renameSync` that can be forced to fail at a specific call to
 * prove the rollback path -- not a fully faked filesystem.
 *
 * Proves: the happy path commits all four files; a failure during staging or staged-verification
 * leaves any pre-existing mirror byte-identical and untouched with no staging debris; and a failure
 * during the final swap-in (after the pre-existing mirror was already backed up) rolls back to the
 * exact original files with no mixed generation and no stale backup/staging directories.
 */

import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import {
  REAL_COMMIT_IO,
  commitMirrorDirectoryAtomically,
  type CommitIo,
  type MirrorFileToCommit,
} from '../src/rehearsal/rookieTransitionProfileMirrorCommit.js';

const sha256 = (bytes: Buffer): string => createHash('sha256').update(bytes).digest('hex');

const workDirs: string[] = [];
const makeWorkDir = (): string => {
  const dir = mkdtempSync(path.join(tmpdir(), 'rtp-mirror-commit-'));
  workDirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of workDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const buildFiles = (contents: Record<string, string>): MirrorFileToCommit[] =>
  Object.entries(contents).map(([filename, text]) => ({
    filename,
    contents: text,
    expectedSha256: sha256(Buffer.from(text, 'utf-8')),
  }));

/** Wraps the real renameSync so the Nth call (1-indexed) throws instead of renaming. */
const ioWithRenameFailureOnCall = (failOnCall: number): CommitIo => {
  let callCount = 0;
  return {
    ...REAL_COMMIT_IO,
    renameSync: ((from, to) => {
      callCount += 1;
      if (callCount === failOnCall) throw new Error(`simulated rename failure on call ${callCount}`);
      return REAL_COMMIT_IO.renameSync(from, to);
    }) as typeof REAL_COMMIT_IO.renameSync,
  };
};

describe('commitMirrorDirectoryAtomically (#151, PR #152 review: transactional four-file swap)', () => {
  it('commits all files on the happy path, with no staging/backup debris left behind', () => {
    const root = makeWorkDir();
    const mirrorDir = path.join(root, 'mirror');
    const files = buildFiles({ 'a.json': '{"a":1}', 'b.csv': 'x\n', 'c.json': '{"c":3}', 'WRAPPER.json': '{"w":true}' });

    const result = commitMirrorDirectoryAtomically(mirrorDir, files, sha256, 'happy-path');

    expect(result).toEqual({ committed: true, rolledBack: false });
    expect(readdirSync(mirrorDir).sort()).toEqual(['WRAPPER.json', 'a.json', 'b.csv', 'c.json']);
    expect(readFileSync(path.join(mirrorDir, 'a.json'), 'utf-8')).toBe('{"a":1}');
    // no sibling staging/backup directories remain
    const siblingEntries = readdirSync(root);
    expect(siblingEntries).toEqual(['mirror']);
  });

  it('leaves no mirror directory and no staging debris if writing a staged file fails', () => {
    const root = makeWorkDir();
    const mirrorDir = path.join(root, 'mirror');
    const files = buildFiles({ 'a.json': '{"a":1}', 'b.csv': 'x\n' });

    const io: CommitIo = {
      ...REAL_COMMIT_IO,
      writeFileSync: ((p, data) => {
        if (String(p).endsWith('b.csv')) throw new Error('simulated disk-full during staging');
        return REAL_COMMIT_IO.writeFileSync(p, data);
      }) as typeof REAL_COMMIT_IO.writeFileSync,
    };

    const result = commitMirrorDirectoryAtomically(mirrorDir, files, sha256, 'staging-write-fail', io);

    expect(result.committed).toBe(false);
    expect(result.rolledBack).toBe(false);
    expect(result.error).toMatch(/staging failed/);
    expect(existsSync(mirrorDir)).toBe(false);
    expect(readdirSync(root)).toEqual([]);
  });

  it('leaves a pre-existing mirror byte-identical and untouched if staged hash verification fails', () => {
    const root = makeWorkDir();
    const mirrorDir = path.join(root, 'mirror');
    mkdirSync(mirrorDir, { recursive: true });
    writeFileSync(path.join(mirrorDir, 'a.json'), '{"original":true}');

    const files: MirrorFileToCommit[] = [{ filename: 'a.json', contents: '{"a":1}', expectedSha256: 'wrong-hash-on-purpose' }];
    const result = commitMirrorDirectoryAtomically(mirrorDir, files, sha256, 'hash-verify-fail');

    expect(result.committed).toBe(false);
    expect(result.error).toMatch(/post-write verification/);
    expect(readdirSync(mirrorDir)).toEqual(['a.json']);
    expect(readFileSync(path.join(mirrorDir, 'a.json'), 'utf-8')).toBe('{"original":true}');
    expect(readdirSync(root)).toEqual(['mirror']);
  });

  it('rolls back to the exact original files if the final swap-in rename fails after backup succeeded', () => {
    const root = makeWorkDir();
    const mirrorDir = path.join(root, 'mirror');
    mkdirSync(mirrorDir, { recursive: true });
    writeFileSync(path.join(mirrorDir, 'a.json'), '{"original":true}');
    writeFileSync(path.join(mirrorDir, 'b.csv'), 'original\n');

    const newFiles = buildFiles({ 'a.json': '{"new":true}', 'b.csv': 'new\n' });
    // Call 1 = backup rename (mirror -> backup, succeeds); call 2 = swap-in rename (staging -> mirror, fails).
    const io = ioWithRenameFailureOnCall(2);

    const result = commitMirrorDirectoryAtomically(mirrorDir, newFiles, sha256, 'swap-fail-rollback', io);

    expect(result.committed).toBe(false);
    expect(result.rolledBack).toBe(true);
    expect(result.error).toMatch(/rolled back/);

    // Original content is restored exactly -- no mixed generation.
    expect(readdirSync(mirrorDir).sort()).toEqual(['a.json', 'b.csv']);
    expect(readFileSync(path.join(mirrorDir, 'a.json'), 'utf-8')).toBe('{"original":true}');
    expect(readFileSync(path.join(mirrorDir, 'b.csv'), 'utf-8')).toBe('original\n');

    // No stale staging or backup directory remains.
    expect(readdirSync(root)).toEqual(['mirror']);
  });

  it('reports failure honestly (rolledBack: false) if rollback itself cannot complete', () => {
    const root = makeWorkDir();
    const mirrorDir = path.join(root, 'mirror');
    mkdirSync(mirrorDir, { recursive: true });
    writeFileSync(path.join(mirrorDir, 'a.json'), '{"original":true}');

    const newFiles = buildFiles({ 'a.json': '{"new":true}' });
    // Every rename call after the first fails: call 1 = backup (succeeds), call 2 = swap-in (fails),
    // and the rollback logic's own renameSync(backup -> mirror) would be call 3 -- fail that too.
    let callCount = 0;
    const io: CommitIo = {
      ...REAL_COMMIT_IO,
      renameSync: ((from, to) => {
        callCount += 1;
        if (callCount >= 2) throw new Error(`simulated failure on rename call ${callCount}`);
        return REAL_COMMIT_IO.renameSync(from, to);
      }) as typeof REAL_COMMIT_IO.renameSync,
    };

    const result = commitMirrorDirectoryAtomically(mirrorDir, newFiles, sha256, 'rollback-fail', io);

    expect(result.committed).toBe(false);
    expect(result.rolledBack).toBe(false);
    expect(result.error).toMatch(/rollback failed/);
    // Backup directory is left in place for manual recovery rather than silently discarded.
    expect(existsSync(`${mirrorDir}.backup-rollback-fail`)).toBe(true);
  });

  it('clears stale staging/backup debris left by a prior aborted run before starting', () => {
    const root = makeWorkDir();
    const mirrorDir = path.join(root, 'mirror');
    const staleStaging = `${mirrorDir}.staging-reused-suffix`;
    const staleBackup = `${mirrorDir}.backup-reused-suffix`;
    mkdirSync(staleStaging, { recursive: true });
    writeFileSync(path.join(staleStaging, 'leftover.txt'), 'stale');
    mkdirSync(staleBackup, { recursive: true });

    const files = buildFiles({ 'a.json': '{"a":1}' });
    const result = commitMirrorDirectoryAtomically(mirrorDir, files, sha256, 'reused-suffix');

    expect(result.committed).toBe(true);
    expect(readdirSync(mirrorDir)).toEqual(['a.json']);
    expect(existsSync(staleStaging)).toBe(false);
    expect(existsSync(staleBackup)).toBe(false);
  });
});
