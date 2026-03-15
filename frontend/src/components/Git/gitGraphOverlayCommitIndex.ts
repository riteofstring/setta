import type { GitCommit } from "utils/generatedTypes";

const MAX_ROW_DECORATIONS = 3;

export type GitGraphDecorationKind =
  | "head"
  | "branch"
  | "remote"
  | "tag"
  | "symbolic"
  | "other";

export type GitGraphDecorationChip = {
  label: string;
  kind: GitGraphDecorationKind;
};

export type GitGraphDecorationChipSummary = {
  chips: GitGraphDecorationChip[];
  extraChipCount: number;
};

const DECORATION_KIND_PRIORITY: Record<GitGraphDecorationKind, number> = {
  head: 0,
  branch: 1,
  remote: 2,
  tag: 3,
  symbolic: 4,
  other: 5,
};

const EMPTY_REMOTE_DECORATION_PREFIXES: ReadonlySet<string> = new Set();

export function buildGitCommitSearchBlob(commit: GitCommit): string {
  const normalizedDecorations = commit.decorations.join(" ").toLowerCase();
  return `${commit.hash} ${commit.subject} ${commit.authorName} ${normalizedDecorations}`.toLowerCase();
}

export function collectRemoteDecorationPrefixes(
  decorations: readonly string[],
): Set<string> {
  const remotePrefixes = new Set<string>();

  for (const raw of decorations) {
    const text = raw.trim();
    if (!text || text.startsWith("tag: ")) {
      continue;
    }

    if (text.startsWith("origin/")) {
      remotePrefixes.add("origin");
      continue;
    }
    if (text.startsWith("upstream/")) {
      remotePrefixes.add("upstream");
      continue;
    }

    const arrowIdx = text.indexOf(" -> ");
    if (arrowIdx === -1) {
      continue;
    }
    const left = text.slice(0, arrowIdx).trim();
    const right = text.slice(arrowIdx + " -> ".length).trim();
    if (!left.endsWith("/HEAD")) {
      continue;
    }
    const prefix = left.slice(0, -"/HEAD".length).trim();
    if (!prefix) {
      continue;
    }
    if (right.startsWith(`${prefix}/`)) {
      remotePrefixes.add(prefix);
    }
  }

  return remotePrefixes;
}

function parseDecorationChip(
  raw: string,
  remoteDecorationPrefixes: ReadonlySet<string>,
): GitGraphDecorationChip | null {
  const text = raw.trim();
  if (!text) {
    return null;
  }
  if (text.startsWith("HEAD -> ")) {
    const branch = text.slice("HEAD -> ".length).trim();
    if (!branch) {
      return null;
    }
    return { label: branch, kind: "head" };
  }
  if (text.startsWith("tag: ")) {
    const tag = text.slice("tag: ".length).trim();
    if (!tag) {
      return null;
    }
    return { label: tag, kind: "tag" };
  }
  const arrowIdx = text.indexOf(" -> ");
  if (arrowIdx !== -1) {
    const left = text.slice(0, arrowIdx).trim();
    if (!left) {
      return null;
    }
    return { label: left, kind: "symbolic" };
  }
  const slashIdx = text.indexOf("/");
  if (slashIdx > 0) {
    const prefix = text.slice(0, slashIdx);
    if (remoteDecorationPrefixes.has(prefix)) {
      return { label: text, kind: "remote" };
    }
  }
  if (text.startsWith("origin/") || text.startsWith("upstream/")) {
    return { label: text, kind: "remote" };
  }
  return { label: text, kind: "branch" };
}

export function summarizeDecorationChips(
  decorations: readonly string[],
  remoteDecorationPrefixes: ReadonlySet<string> = EMPTY_REMOTE_DECORATION_PREFIXES,
): GitGraphDecorationChipSummary {
  const allChips = decorations
    .map((decoration) =>
      parseDecorationChip(decoration, remoteDecorationPrefixes),
    )
    .filter((chip): chip is GitGraphDecorationChip => chip !== null)
    .sort(
      (a, b) =>
        DECORATION_KIND_PRIORITY[a.kind] - DECORATION_KIND_PRIORITY[b.kind],
    );
  const chips = allChips.slice(0, MAX_ROW_DECORATIONS);
  return {
    chips,
    extraChipCount: Math.max(0, allChips.length - chips.length),
  };
}

export function buildGitGraphDecorationChipSummaryByHash(
  commits: readonly GitCommit[],
): Map<string, GitGraphDecorationChipSummary> {
  const allDecorations: string[] = [];
  for (const commit of commits) {
    allDecorations.push(...commit.decorations);
  }
  const remoteDecorationPrefixes =
    collectRemoteDecorationPrefixes(allDecorations);

  const chipSummaryByHash = new Map<string, GitGraphDecorationChipSummary>();
  for (const commit of commits) {
    chipSummaryByHash.set(
      commit.hash,
      summarizeDecorationChips(commit.decorations, remoteDecorationPrefixes),
    );
  }
  return chipSummaryByHash;
}

export function buildGitCommitLookupByHash(
  commits: readonly GitCommit[],
): Map<string, GitCommit> {
  const commitsByHash = new Map<string, GitCommit>();
  for (const commit of commits) {
    commitsByHash.set(commit.hash, commit);
  }
  return commitsByHash;
}

export function buildGitGraphRowHeightCacheKey({
  commitDigest,
  allRefs,
  filterText,
}: {
  commitDigest: string;
  allRefs: boolean;
  filterText: string;
}): string {
  const normalizedFilter = filterText.trim().toLowerCase();
  const refMode = allRefs ? "all" : "branch";
  return `${commitDigest}:${refMode}:${normalizedFilter}`;
}

export function buildGitGraphCommitDigest(
  commits: readonly GitCommit[],
): string {
  if (commits.length === 0) {
    return "0";
  }
  let digest = 2166136261;
  for (const commit of commits) {
    for (let idx = 0; idx < commit.hash.length; idx += 1) {
      digest ^= commit.hash.charCodeAt(idx);
      digest = Math.imul(digest, 16777619) >>> 0;
    }
    digest ^= 124;
    digest = Math.imul(digest, 16777619) >>> 0;
  }
  return `${commits.length}:${digest.toString(16)}`;
}
