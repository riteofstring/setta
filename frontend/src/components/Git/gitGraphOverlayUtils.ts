import type { GitreadCommit as Commit } from "openapi/http";
import {
  DEFAULT_GIT_GRAPH_AUTHOR_WIDTH_PX,
  DEFAULT_GIT_GRAPH_COL_WIDTH_PX,
  DEFAULT_GIT_GRAPH_DATE_WIDTH_PX,
  DEFAULT_GIT_GRAPH_HASH_WIDTH_PX,
} from "utils/gitGraphLayoutDefaults";

export const MESSAGE_COL_MIN_WIDTH_PX = 96;

export const GRAPH_COL_MIN_WIDTH_PX = 80;
export const GRAPH_COL_MAX_WIDTH_PX = 240;
export const AUTHOR_COL_MIN_WIDTH_PX = 90;
export const AUTHOR_COL_MAX_WIDTH_PX = 260;
export const DATE_COL_MIN_WIDTH_PX = 90;
export const DATE_COL_MAX_WIDTH_PX = 220;
export const HASH_COL_MIN_WIDTH_PX = 70;
export const HASH_COL_MAX_WIDTH_PX = 160;

const MAX_ROW_DECORATIONS = 3;
const LOAD_MORE_THRESHOLD_ROWS = 40;

type DecorationKind =
  | "head"
  | "branch"
  | "remote"
  | "tag"
  | "symbolic"
  | "other";

export type DecorationChip = {
  label: string;
  kind: DecorationKind;
};

export type DecorationChipSummary = {
  chips: DecorationChip[];
  extraChipCount: number;
};

type GitGraphColumnKey = "graph" | "author" | "date" | "hash";
export type GitGraphColumnBoundary =
  | "graphMessage"
  | "messageAuthor"
  | "authorDate"
  | "dateHash";
export type GitGraphColumnWidths = Record<GitGraphColumnKey, number>;
export type GitGraphColumnWidthPatch = Partial<GitGraphColumnWidths>;

const DECORATION_KIND_PRIORITY: Record<DecorationKind, number> = {
  head: 0,
  branch: 1,
  remote: 2,
  tag: 3,
  symbolic: 4,
  other: 5,
};

const EMPTY_REMOTE_DECORATION_PREFIXES: ReadonlySet<string> = new Set();

const GIT_GRAPH_COLUMN_DEFAULT_PX_BY_KEY: GitGraphColumnWidths = {
  graph: DEFAULT_GIT_GRAPH_COL_WIDTH_PX,
  author: DEFAULT_GIT_GRAPH_AUTHOR_WIDTH_PX,
  date: DEFAULT_GIT_GRAPH_DATE_WIDTH_PX,
  hash: DEFAULT_GIT_GRAPH_HASH_WIDTH_PX,
};

const GIT_GRAPH_COLUMN_MIN_PX_BY_KEY: GitGraphColumnWidths = {
  graph: GRAPH_COL_MIN_WIDTH_PX,
  author: AUTHOR_COL_MIN_WIDTH_PX,
  date: DATE_COL_MIN_WIDTH_PX,
  hash: HASH_COL_MIN_WIDTH_PX,
};

const GIT_GRAPH_COLUMN_MAX_PX_BY_KEY: GitGraphColumnWidths = {
  graph: GRAPH_COL_MAX_WIDTH_PX,
  author: AUTHOR_COL_MAX_WIDTH_PX,
  date: DATE_COL_MAX_WIDTH_PX,
  hash: HASH_COL_MAX_WIDTH_PX,
};

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

export function buildGitCommitSearchBlob(commit: Commit): string {
  const normalizedDecorations = (commit.decorations ?? [])
    .join(" ")
    .toLowerCase();
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
    const prefix = resolveRemoteDecorationPrefix(text);
    if (prefix) {
      remotePrefixes.add(prefix);
    }
  }

  return remotePrefixes;
}

function resolveRemoteDecorationPrefix(text: string): string | null {
  if (text.startsWith("origin/")) {
    return "origin";
  }
  if (text.startsWith("upstream/")) {
    return "upstream";
  }
  const arrowIdx = text.indexOf(" -> ");
  if (arrowIdx === -1) {
    return null;
  }
  const left = text.slice(0, arrowIdx).trim();
  const right = text.slice(arrowIdx + " -> ".length).trim();
  if (!left.endsWith("/HEAD")) {
    return null;
  }
  const prefix = left.slice(0, -"/HEAD".length).trim();
  if (!prefix || !right.startsWith(`${prefix}/`)) {
    return null;
  }
  return prefix;
}

function parseDecorationChip(
  raw: string,
  remoteDecorationPrefixes: ReadonlySet<string>,
): DecorationChip | null {
  const text = raw.trim();
  if (!text) {
    return null;
  }
  return (
    parseHeadDecorationChip(text) ??
    parseTagDecorationChip(text) ??
    parseSymbolicDecorationChip(text) ??
    parseRemoteDecorationChip(text, remoteDecorationPrefixes) ?? {
      label: text,
      kind: "branch",
    }
  );
}

function parseHeadDecorationChip(text: string): DecorationChip | null {
  if (!text.startsWith("HEAD -> ")) {
    return null;
  }
  const branch = text.slice("HEAD -> ".length).trim();
  if (!branch) {
    return null;
  }
  return { label: branch, kind: "head" };
}

function parseTagDecorationChip(text: string): DecorationChip | null {
  if (!text.startsWith("tag: ")) {
    return null;
  }
  const tag = text.slice("tag: ".length).trim();
  if (!tag) {
    return null;
  }
  return { label: tag, kind: "tag" };
}

function parseSymbolicDecorationChip(text: string): DecorationChip | null {
  const arrowIdx = text.indexOf(" -> ");
  if (arrowIdx === -1) {
    return null;
  }
  const left = text.slice(0, arrowIdx).trim();
  if (!left) {
    return null;
  }
  return { label: left, kind: "symbolic" };
}

function parseRemoteDecorationChip(
  text: string,
  remoteDecorationPrefixes: ReadonlySet<string>,
): DecorationChip | null {
  const slashIdx = text.indexOf("/");
  if (slashIdx > 0 && remoteDecorationPrefixes.has(text.slice(0, slashIdx))) {
    return { label: text, kind: "remote" };
  }
  if (text.startsWith("origin/") || text.startsWith("upstream/")) {
    return { label: text, kind: "remote" };
  }
  return null;
}

export function summarizeDecorationChips(
  decorations: readonly string[],
  remoteDecorationPrefixes: ReadonlySet<string> = EMPTY_REMOTE_DECORATION_PREFIXES,
): DecorationChipSummary {
  const allChips = decorations
    .map((decoration) =>
      parseDecorationChip(decoration, remoteDecorationPrefixes),
    )
    .filter((chip): chip is DecorationChip => chip !== null)
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

export function buildGitCommitLookupByHash(
  commits: readonly Commit[],
): Map<string, Commit> {
  const commitsByHash = new Map<string, Commit>();
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

export function buildGitGraphCommitDigest(commits: readonly Commit[]): string {
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

export function shouldLoadMoreGitGraphCommits({
  graphState,
  filteredRowCount,
  stopIndex,
  isFilterActive,
}: {
  graphState: {
    isLoading: boolean;
    isLoadingMore: boolean;
    loadMoreError: string | null;
    nextOffset: number | null;
    hasMore: boolean;
  };
  filteredRowCount: number;
  stopIndex: number;
  isFilterActive: boolean;
}): boolean {
  if (
    graphState.isLoading ||
    graphState.isLoadingMore ||
    graphState.loadMoreError !== null ||
    graphState.nextOffset === null ||
    !graphState.hasMore ||
    isFilterActive
  ) {
    return false;
  }
  return filteredRowCount - 1 - stopIndex <= LOAD_MORE_THRESHOLD_ROWS;
}

function clampGitGraphSingleColumnWidth(
  key: GitGraphColumnKey,
  requestedWidth: number,
  start: GitGraphColumnWidths,
  contentWidth: number,
): number {
  const minPx = GIT_GRAPH_COLUMN_MIN_PX_BY_KEY[key];
  const maxPxConstant = GIT_GRAPH_COLUMN_MAX_PX_BY_KEY[key];
  const otherSum =
    start.graph + start.author + start.date + start.hash - start[key];
  const maxFit = Math.max(
    minPx,
    contentWidth - otherSum - MESSAGE_COL_MIN_WIDTH_PX,
  );
  const maxPx = Math.min(maxPxConstant, maxFit);
  return clamp(requestedWidth, minPx, maxPx);
}

function clampGitGraphBoundaryDelta(
  leftKey: GitGraphColumnKey,
  rightKey: GitGraphColumnKey,
  delta: number,
  start: GitGraphColumnWidths,
): number {
  const lower = Math.max(
    GIT_GRAPH_COLUMN_MIN_PX_BY_KEY[leftKey] - start[leftKey],
    start[rightKey] - GIT_GRAPH_COLUMN_MAX_PX_BY_KEY[rightKey],
  );
  const upper = Math.min(
    GIT_GRAPH_COLUMN_MAX_PX_BY_KEY[leftKey] - start[leftKey],
    start[rightKey] - GIT_GRAPH_COLUMN_MIN_PX_BY_KEY[rightKey],
  );
  if (lower > upper) {
    return 0;
  }
  return clamp(delta, lower, upper);
}

export function computeGitGraphColumnWidthPatch({
  boundary,
  deltaX,
  start,
  contentWidth,
}: {
  boundary: GitGraphColumnBoundary;
  deltaX: number;
  start: GitGraphColumnWidths;
  contentWidth: number;
}): GitGraphColumnWidthPatch {
  switch (boundary) {
    case "graphMessage":
      return {
        graph: clampGitGraphSingleColumnWidth(
          "graph",
          start.graph + deltaX,
          start,
          contentWidth,
        ),
      };
    case "messageAuthor":
      return {
        author: clampGitGraphSingleColumnWidth(
          "author",
          start.author - deltaX,
          start,
          contentWidth,
        ),
      };
    case "authorDate": {
      const clampedDelta = clampGitGraphBoundaryDelta(
        "author",
        "date",
        deltaX,
        start,
      );
      return {
        author: start.author + clampedDelta,
        date: start.date - clampedDelta,
      };
    }
    case "dateHash": {
      const clampedDelta = clampGitGraphBoundaryDelta(
        "date",
        "hash",
        deltaX,
        start,
      );
      return {
        date: start.date + clampedDelta,
        hash: start.hash - clampedDelta,
      };
    }
  }
}

export function computeGitGraphColumnDoubleClickPatch({
  boundary,
  start,
  contentWidth,
}: {
  boundary: GitGraphColumnBoundary;
  start: GitGraphColumnWidths;
  contentWidth: number;
}): GitGraphColumnWidthPatch {
  switch (boundary) {
    case "graphMessage":
      return {
        graph: clampGitGraphSingleColumnWidth(
          "graph",
          GIT_GRAPH_COLUMN_DEFAULT_PX_BY_KEY.graph,
          start,
          contentWidth,
        ),
      };
    case "messageAuthor":
      return {
        author: clampGitGraphSingleColumnWidth(
          "author",
          GIT_GRAPH_COLUMN_DEFAULT_PX_BY_KEY.author,
          start,
          contentWidth,
        ),
      };
    case "authorDate": {
      const clampedDelta = clampGitGraphBoundaryDelta(
        "author",
        "date",
        GIT_GRAPH_COLUMN_DEFAULT_PX_BY_KEY.author - start.author,
        start,
      );
      return {
        author: start.author + clampedDelta,
        date: start.date - clampedDelta,
      };
    }
    case "dateHash": {
      const clampedDelta = clampGitGraphBoundaryDelta(
        "date",
        "hash",
        GIT_GRAPH_COLUMN_DEFAULT_PX_BY_KEY.date - start.date,
        start,
      );
      return {
        date: start.date + clampedDelta,
        hash: start.hash - clampedDelta,
      };
    }
  }
}

export function clampGitGraphPersistedWidths(
  boundary: GitGraphColumnBoundary,
  latestWidths: GitGraphColumnWidths,
): GitGraphColumnWidthPatch {
  const persisted: GitGraphColumnWidthPatch = {};
  const keysByBoundary = {
    graphMessage: ["graph"],
    messageAuthor: ["author"],
    authorDate: ["author", "date"],
    dateHash: ["date", "hash"],
  } as const satisfies Record<
    GitGraphColumnBoundary,
    readonly GitGraphColumnKey[]
  >;

  for (const key of keysByBoundary[boundary]) {
    persisted[key] = clamp(
      latestWidths[key],
      GIT_GRAPH_COLUMN_MIN_PX_BY_KEY[key],
      GIT_GRAPH_COLUMN_MAX_PX_BY_KEY[key],
    );
  }

  return persisted;
}
