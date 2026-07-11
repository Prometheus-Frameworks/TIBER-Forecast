/**
 * Integration-level tests for git-based source-identity resolution (#151, PR #152 review). Uses
 * real temporary git repositories (via actual `git init`/`commit`/`remote` calls) rather than a
 * mocked filesystem, to prove that a non-git directory, a wrong remote, or an unexpected commit are
 * all detected before any mirror output is staged -- and that there is no override flag anywhere
 * in this resolution path for an operator to bypass verification with an asserted value.
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { SOURCE_COMMIT, SOURCE_REPO } from '../src/rehearsal/rookieTransitionProfileMirror.js';
import { parseRepoSlug, resolveGitSourceIdentity } from '../src/rehearsal/rookieTransitionProfileMirrorSourceIdentity.js';

const workDirs: string[] = [];
const makeWorkDir = (): string => {
  const dir = mkdtempSync(path.join(tmpdir(), 'rtp-source-identity-'));
  workDirs.push(dir);
  return dir;
};

afterEach(() => {
  for (const dir of workDirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

const git = (cwd: string, args: string[]): void => {
  execFileSync('git', args, { cwd, stdio: 'ignore' });
};

const initRealGitRepo = (dir: string, remoteUrl: string): string => {
  git(dir, ['init', '--quiet']);
  git(dir, ['config', 'user.email', 'test@example.com']);
  git(dir, ['config', 'user.name', 'Test']);
  git(dir, ['remote', 'add', 'origin', remoteUrl]);
  git(dir, ['commit', '--allow-empty', '-m', 'test commit', '--quiet']);
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: dir, encoding: 'utf-8' }).trim();
};

describe('resolveGitSourceIdentity (#151, PR #152 review: verified, not caller-claimed, identity)', () => {
  it('resolves the real repo slug and commit from an actual git checkout', () => {
    const dir = makeWorkDir();
    const actualCommit = initRealGitRepo(dir, 'https://github.com/Prometheus-Frameworks/TIBER-Rookies');

    const identity = resolveGitSourceIdentity(dir);

    expect(identity.sourceRepo).toBe(SOURCE_REPO);
    expect(identity.sourceCommit).toBe(actualCommit);
  });

  it('resolves undefined for both fields when the source root is not a git checkout at all', () => {
    const dir = makeWorkDir(); // empty directory, never `git init`-ed

    const identity = resolveGitSourceIdentity(dir);

    expect(identity.sourceRepo).toBeUndefined();
    expect(identity.sourceCommit).toBeUndefined();
  });

  it('resolves the ACTUAL (wrong) remote rather than the pinned value when origin points elsewhere', () => {
    const dir = makeWorkDir();
    initRealGitRepo(dir, 'https://github.com/Prometheus-Frameworks/TIBER-Data');

    const identity = resolveGitSourceIdentity(dir);

    expect(identity.sourceRepo).toBe('Prometheus-Frameworks/TIBER-Data');
    expect(identity.sourceRepo).not.toBe(SOURCE_REPO);
  });

  it('resolves the ACTUAL checked-out commit, which differs from the pin for a freshly created repo', () => {
    const dir = makeWorkDir();
    const actualCommit = initRealGitRepo(dir, 'https://github.com/Prometheus-Frameworks/TIBER-Rookies');

    const identity = resolveGitSourceIdentity(dir);

    expect(identity.sourceCommit).toBe(actualCommit);
    expect(identity.sourceCommit).not.toBe(SOURCE_COMMIT);
  });

  it('resolves undefined for the repo when a git checkout has no origin remote configured', () => {
    const dir = makeWorkDir();
    git(dir, ['init', '--quiet']);
    git(dir, ['config', 'user.email', 'test@example.com']);
    git(dir, ['config', 'user.name', 'Test']);
    git(dir, ['commit', '--allow-empty', '-m', 'no remote', '--quiet']);

    const identity = resolveGitSourceIdentity(dir);

    expect(identity.sourceRepo).toBeUndefined();
    expect(identity.sourceCommit).toBeDefined();
  });

  it('parseRepoSlug handles both https and ssh remote URL forms, with or without a .git suffix', () => {
    expect(parseRepoSlug('https://github.com/Prometheus-Frameworks/TIBER-Rookies')).toBe('Prometheus-Frameworks/TIBER-Rookies');
    expect(parseRepoSlug('https://github.com/Prometheus-Frameworks/TIBER-Rookies.git')).toBe('Prometheus-Frameworks/TIBER-Rookies');
    expect(parseRepoSlug('git@github.com:Prometheus-Frameworks/TIBER-Rookies.git')).toBe('Prometheus-Frameworks/TIBER-Rookies');
    expect(parseRepoSlug(undefined)).toBeUndefined();
  });
});
