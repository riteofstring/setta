import {
  DEFAULT_GIT_GRAPH_AUTHOR_WIDTH_PX,
  DEFAULT_GIT_GRAPH_COL_WIDTH_PX,
  DEFAULT_GIT_GRAPH_DATE_WIDTH_PX,
  DEFAULT_GIT_GRAPH_HASH_WIDTH_PX,
  DEFAULT_GIT_GRAPH_SPLIT_PCT,
} from "utils/gitGraphLayoutDefaults";

export const COMMIT_GRID_HORIZONTAL_PADDING_PX = 24; // px-3 on both sides
export const COMMIT_GRID_GAP_PX = 8; // gap-2
export const COMMIT_GRID_GAP_COUNT = 4;
export const MESSAGE_COL_MIN_WIDTH_PX = 96;

export const GRAPH_COL_MIN_WIDTH_PX = 80;
export const GRAPH_COL_MAX_WIDTH_PX = 240;
export const AUTHOR_COL_MIN_WIDTH_PX = 90;
export const AUTHOR_COL_MAX_WIDTH_PX = 260;
export const DATE_COL_MIN_WIDTH_PX = 90;
export const DATE_COL_MAX_WIDTH_PX = 220;
export const HASH_COL_MIN_WIDTH_PX = 70;
export const HASH_COL_MAX_WIDTH_PX = 160;

export const GIT_GRAPH_HISTORY_PANE_MIN_WIDTH_PX =
  GRAPH_COL_MIN_WIDTH_PX +
  AUTHOR_COL_MIN_WIDTH_PX +
  DATE_COL_MIN_WIDTH_PX +
  HASH_COL_MIN_WIDTH_PX +
  MESSAGE_COL_MIN_WIDTH_PX +
  COMMIT_GRID_HORIZONTAL_PADDING_PX +
  COMMIT_GRID_GAP_PX * COMMIT_GRID_GAP_COUNT;
export const GIT_GRAPH_DIFF_PANE_MIN_WIDTH_PX = 360;

export const CSS_VAR_GIT_GRAPH_SPLIT_PCT = "--git-graph-split-pct";
export const CSS_VAR_GIT_GRAPH_COL_GRAPH = "--git-graph-col-graph";
export const CSS_VAR_GIT_GRAPH_COL_AUTHOR = "--git-graph-col-author";
export const CSS_VAR_GIT_GRAPH_COL_DATE = "--git-graph-col-date";
export const CSS_VAR_GIT_GRAPH_COL_HASH = "--git-graph-col-hash";

export const COMMIT_GRID_TEMPLATE_COLUMNS = `var(${CSS_VAR_GIT_GRAPH_COL_GRAPH}, ${DEFAULT_GIT_GRAPH_COL_WIDTH_PX}px) minmax(${MESSAGE_COL_MIN_WIDTH_PX}px, 1fr) var(${CSS_VAR_GIT_GRAPH_COL_AUTHOR}, ${DEFAULT_GIT_GRAPH_AUTHOR_WIDTH_PX}px) var(${CSS_VAR_GIT_GRAPH_COL_DATE}, ${DEFAULT_GIT_GRAPH_DATE_WIDTH_PX}px) var(${CSS_VAR_GIT_GRAPH_COL_HASH}, ${DEFAULT_GIT_GRAPH_HASH_WIDTH_PX}px)`;

export type GitGraphColumnKey = "graph" | "author" | "date" | "hash";
export type GitGraphColumnBoundary =
  | "graphMessage"
  | "messageAuthor"
  | "authorDate"
  | "dateHash";
export type GitGraphColumnWidths = Record<GitGraphColumnKey, number>;
export type GitGraphColumnWidthPatch = Partial<GitGraphColumnWidths>;
export type GitGraphColumnPersistPatch = Partial<{
  gitGraphColWidthPx: number;
  gitGraphAuthorWidthPx: number;
  gitGraphDateWidthPx: number;
  gitGraphHashWidthPx: number;
}>;

const GIT_GRAPH_COLUMN_CSS_VARS: Record<GitGraphColumnKey, string> = {
  graph: CSS_VAR_GIT_GRAPH_COL_GRAPH,
  author: CSS_VAR_GIT_GRAPH_COL_AUTHOR,
  date: CSS_VAR_GIT_GRAPH_COL_DATE,
  hash: CSS_VAR_GIT_GRAPH_COL_HASH,
};

const GIT_GRAPH_COLUMN_DEFAULT_WIDTHS: GitGraphColumnWidths = {
  graph: DEFAULT_GIT_GRAPH_COL_WIDTH_PX,
  author: DEFAULT_GIT_GRAPH_AUTHOR_WIDTH_PX,
  date: DEFAULT_GIT_GRAPH_DATE_WIDTH_PX,
  hash: DEFAULT_GIT_GRAPH_HASH_WIDTH_PX,
};

const GIT_GRAPH_COLUMN_MIN_WIDTHS: GitGraphColumnWidths = {
  graph: GRAPH_COL_MIN_WIDTH_PX,
  author: AUTHOR_COL_MIN_WIDTH_PX,
  date: DATE_COL_MIN_WIDTH_PX,
  hash: HASH_COL_MIN_WIDTH_PX,
};

const GIT_GRAPH_COLUMN_MAX_WIDTHS: GitGraphColumnWidths = {
  graph: GRAPH_COL_MAX_WIDTH_PX,
  author: AUTHOR_COL_MAX_WIDTH_PX,
  date: DATE_COL_MAX_WIDTH_PX,
  hash: HASH_COL_MAX_WIDTH_PX,
};

const GIT_GRAPH_BOUNDARY_CHANGED_KEYS: Record<
  GitGraphColumnBoundary,
  readonly GitGraphColumnKey[]
> = {
  graphMessage: ["graph"],
  messageAuthor: ["author"],
  authorDate: ["author", "date"],
  dateHash: ["date", "hash"],
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampGitGraphColumnDelta(
  delta: number,
  lower: number,
  upper: number,
): number {
  if (lower > upper) {
    return 0;
  }
  return clamp(delta, lower, upper);
}

function clampGitGraphSingleColumnWidth(
  key: GitGraphColumnKey,
  requestedWidth: number,
  startWidths: GitGraphColumnWidths,
  contentWidth: number,
): number {
  const minPx = GIT_GRAPH_COLUMN_MIN_WIDTHS[key];
  const maxPxConstant = GIT_GRAPH_COLUMN_MAX_WIDTHS[key];
  const otherWidthSum =
    startWidths.graph +
    startWidths.author +
    startWidths.date +
    startWidths.hash -
    startWidths[key];
  const maxFit = Math.max(
    minPx,
    contentWidth - otherWidthSum - MESSAGE_COL_MIN_WIDTH_PX,
  );
  const maxPx = Math.min(maxPxConstant, maxFit);
  return clamp(requestedWidth, minPx, maxPx);
}

export function clampGitGraphSplitPct(value: number): number {
  return clamp(value, 0, 100);
}

export function clampGitGraphColumnWidth(
  key: GitGraphColumnKey,
  value: number,
): number {
  return clamp(
    value,
    GIT_GRAPH_COLUMN_MIN_WIDTHS[key],
    GIT_GRAPH_COLUMN_MAX_WIDTHS[key],
  );
}

export function clampGitGraphColumnWidths(
  widths: GitGraphColumnWidths,
): GitGraphColumnWidths {
  return {
    graph: clampGitGraphColumnWidth("graph", widths.graph),
    author: clampGitGraphColumnWidth("author", widths.author),
    date: clampGitGraphColumnWidth("date", widths.date),
    hash: clampGitGraphColumnWidth("hash", widths.hash),
  };
}

export function getGitGraphColumnCssVar(key: GitGraphColumnKey): string {
  return GIT_GRAPH_COLUMN_CSS_VARS[key];
}

export function getGitGraphBoundaryChangedKeys(
  boundary: GitGraphColumnBoundary,
): readonly GitGraphColumnKey[] {
  return GIT_GRAPH_BOUNDARY_CHANGED_KEYS[boundary];
}

export function measureGitGraphColumnContentWidth({
  headerClientWidth,
  paddingLeftPx,
  paddingRightPx,
  columnGapPx,
}: {
  headerClientWidth: number;
  paddingLeftPx: number;
  paddingRightPx: number;
  columnGapPx: number;
}): number {
  const totalGapWidth = columnGapPx * COMMIT_GRID_GAP_COUNT;
  return Math.max(
    1,
    headerClientWidth - paddingLeftPx - paddingRightPx - totalGapWidth,
  );
}

export function resolveGitGraphPaneSplitPct({
  wrapperWidth,
  handleWidth,
  splitPct,
  deltaX,
}: {
  wrapperWidth: number;
  handleWidth: number;
  splitPct: number;
  deltaX: number;
}): number {
  const startLeftPx = (wrapperWidth * clampGitGraphSplitPct(splitPct)) / 100;
  const minLeft = GIT_GRAPH_HISTORY_PANE_MIN_WIDTH_PX;
  const maxLeft = Math.max(
    minLeft,
    wrapperWidth - handleWidth - GIT_GRAPH_DIFF_PANE_MIN_WIDTH_PX,
  );
  const nextLeftPx = clamp(startLeftPx + deltaX, minLeft, maxLeft);
  return clampGitGraphSplitPct((nextLeftPx / Math.max(1, wrapperWidth)) * 100);
}

export function resolveGitGraphColumnWidthsFromDelta({
  boundary,
  startWidths,
  contentWidth,
  deltaX,
}: {
  boundary: GitGraphColumnBoundary;
  startWidths: GitGraphColumnWidths;
  contentWidth: number;
  deltaX: number;
}): GitGraphColumnWidthPatch {
  if (boundary === "graphMessage") {
    return {
      graph: clampGitGraphSingleColumnWidth(
        "graph",
        startWidths.graph + deltaX,
        startWidths,
        contentWidth,
      ),
    };
  }
  if (boundary === "messageAuthor") {
    return {
      author: clampGitGraphSingleColumnWidth(
        "author",
        startWidths.author - deltaX,
        startWidths,
        contentWidth,
      ),
    };
  }
  if (boundary === "authorDate") {
    const clampedDelta = clampGitGraphColumnDelta(
      deltaX,
      Math.max(
        GIT_GRAPH_COLUMN_MIN_WIDTHS.author - startWidths.author,
        startWidths.date - GIT_GRAPH_COLUMN_MAX_WIDTHS.date,
      ),
      Math.min(
        GIT_GRAPH_COLUMN_MAX_WIDTHS.author - startWidths.author,
        startWidths.date - GIT_GRAPH_COLUMN_MIN_WIDTHS.date,
      ),
    );
    return {
      author: startWidths.author + clampedDelta,
      date: startWidths.date - clampedDelta,
    };
  }
  const clampedDelta = clampGitGraphColumnDelta(
    deltaX,
    Math.max(
      GIT_GRAPH_COLUMN_MIN_WIDTHS.date - startWidths.date,
      startWidths.hash - GIT_GRAPH_COLUMN_MAX_WIDTHS.hash,
    ),
    Math.min(
      GIT_GRAPH_COLUMN_MAX_WIDTHS.date - startWidths.date,
      startWidths.hash - GIT_GRAPH_COLUMN_MIN_WIDTHS.hash,
    ),
  );
  return {
    date: startWidths.date + clampedDelta,
    hash: startWidths.hash - clampedDelta,
  };
}

export function resolveGitGraphColumnResetWidths({
  boundary,
  startWidths,
  contentWidth,
}: {
  boundary: GitGraphColumnBoundary;
  startWidths: GitGraphColumnWidths;
  contentWidth: number;
}): GitGraphColumnWidthPatch {
  if (boundary === "graphMessage") {
    return {
      graph: clampGitGraphSingleColumnWidth(
        "graph",
        GIT_GRAPH_COLUMN_DEFAULT_WIDTHS.graph,
        startWidths,
        contentWidth,
      ),
    };
  }
  if (boundary === "messageAuthor") {
    return {
      author: clampGitGraphSingleColumnWidth(
        "author",
        GIT_GRAPH_COLUMN_DEFAULT_WIDTHS.author,
        startWidths,
        contentWidth,
      ),
    };
  }
  if (boundary === "authorDate") {
    const targetDelta =
      GIT_GRAPH_COLUMN_DEFAULT_WIDTHS.author - startWidths.author;
    const clampedDelta = clampGitGraphColumnDelta(
      targetDelta,
      Math.max(
        GIT_GRAPH_COLUMN_MIN_WIDTHS.author - startWidths.author,
        startWidths.date - GIT_GRAPH_COLUMN_MAX_WIDTHS.date,
      ),
      Math.min(
        GIT_GRAPH_COLUMN_MAX_WIDTHS.author - startWidths.author,
        startWidths.date - GIT_GRAPH_COLUMN_MIN_WIDTHS.date,
      ),
    );
    return {
      author: startWidths.author + clampedDelta,
      date: startWidths.date - clampedDelta,
    };
  }
  const targetDelta = GIT_GRAPH_COLUMN_DEFAULT_WIDTHS.date - startWidths.date;
  const clampedDelta = clampGitGraphColumnDelta(
    targetDelta,
    Math.max(
      GIT_GRAPH_COLUMN_MIN_WIDTHS.date - startWidths.date,
      startWidths.hash - GIT_GRAPH_COLUMN_MAX_WIDTHS.hash,
    ),
    Math.min(
      GIT_GRAPH_COLUMN_MAX_WIDTHS.date - startWidths.date,
      startWidths.hash - GIT_GRAPH_COLUMN_MIN_WIDTHS.hash,
    ),
  );
  return {
    date: startWidths.date + clampedDelta,
    hash: startWidths.hash - clampedDelta,
  };
}

export function finalizeGitGraphColumnWidths({
  boundary,
  widths,
}: {
  boundary: GitGraphColumnBoundary;
  widths: GitGraphColumnWidths;
}): GitGraphColumnWidthPatch {
  const patch: GitGraphColumnWidthPatch = {};
  for (const key of getGitGraphBoundaryChangedKeys(boundary)) {
    patch[key] = clampGitGraphColumnWidth(key, widths[key]);
  }
  return patch;
}

export function buildGitGraphColumnPersistPatch(
  next: GitGraphColumnWidthPatch,
): GitGraphColumnPersistPatch {
  const patch: GitGraphColumnPersistPatch = {};
  if (next.graph !== undefined) {
    patch.gitGraphColWidthPx = next.graph;
  }
  if (next.author !== undefined) {
    patch.gitGraphAuthorWidthPx = next.author;
  }
  if (next.date !== undefined) {
    patch.gitGraphDateWidthPx = next.date;
  }
  if (next.hash !== undefined) {
    patch.gitGraphHashWidthPx = next.hash;
  }
  return patch;
}

export { DEFAULT_GIT_GRAPH_SPLIT_PCT };
