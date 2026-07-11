/**
 * Resolves the ACTUAL repository identity and commit of a local TIBER-Rookies checkout for the
 * rookie_transition_profile_v0.2.0 Forecast mirror refresh (#151, PR #152 review).
 *
 * PR #152's review found that the original CLI accepted `--source-repo=`/`--source-commit=`
 * override flags that let an operator simply ASSERT the expected identity strings instead of
 * having them verified against the real checkout -- defeating the "verified, not caller-claimed"
 * requirement in #151. This module has no override parameter at all: it always shells out to `git`
 * against the given source root and returns whatever it actually finds (or `undefined` if the root
 * isn't a git checkout, or has no `origin` remote). The caller (the CLI) is responsible for
 * comparing the result to the pinned constants and failing closed on any mismatch or `undefined`.
 */

import { execFileSync } from 'node:child_process';

export const parseRepoSlug = (remoteUrl: string | undefined): string | undefined => {
  if (!remoteUrl) return undefined;
  const withoutGitSuffix = remoteUrl.replace(/\.git$/, '');
  const match = withoutGitSuffix.match(/[:/]([^/:]+\/[^/]+)$/);
  return match?.[1];
};

export interface ResolvedSourceIdentity {
  sourceCommit: string | undefined;
  sourceRepo: string | undefined;
}

/** Runs `git <args>` against `sourceRoot`; returns `undefined` (never throws) if git fails, the
 * path isn't a git checkout, or the command otherwise errors -- e.g. no commits yet, no remote. */
export const runGit = (sourceRoot: string, args: string[]): string | undefined => {
  try {
    return execFileSync('git', args, { cwd: sourceRoot, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return undefined;
  }
};

export const resolveGitSourceIdentity = (sourceRoot: string): ResolvedSourceIdentity => ({
  sourceCommit: runGit(sourceRoot, ['rev-parse', 'HEAD']),
  sourceRepo: parseRepoSlug(runGit(sourceRoot, ['remote', 'get-url', 'origin'])),
});
