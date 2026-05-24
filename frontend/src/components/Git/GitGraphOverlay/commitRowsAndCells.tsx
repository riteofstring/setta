import {
  gitFileStatusCategoryFromCommitFile,
  gitFileStatusVisuals,
} from "components/Git/gitFileStatusVisuals";

import type {
  GitreadCommitChangedFile as CommitChangedFile,
  GitreadCommitDetailsResponse as CommitDetailsResponse,
} from "openapi/http";

import { useEffect, useRef } from "react";

import {
  clearGitGraphSelectedCommit,
  selectGitCommit,
  selectGitCommitFile,
} from "state/actions/git";

import { useGitStore } from "state/git";

import {
  summarizeDecorationChips,
  type DecorationChip,
} from "../gitGraphOverlayUtils";

import {
  COMMIT_GRID_TEMPLATE_COLUMNS,
  DATE_FORMATTER,
  ROW_HEIGHT,
  clampNonNegative,
  laneColorForId,
} from "./graphData";

import { GitCommitRowProps } from "./overlayStateAndHistory";

export function GitCommitRow({
  index,
  style,
  rows,
  selectedHash,
  palette,
  darkMode,
  graphViewBoxWidth,
  laneWidth,
  dynamicRowHeight,
  decorationChipSummaryByHash,
}: GitCommitRowProps) {
  const row = rows[index];
  if (!row) {
    return null;
  }
  const commit = row.commit;
  const isSelected = commit.hash === selectedHash;
  const rowRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const el = rowRef.current;
    if (!el) {
      return;
    }
    return dynamicRowHeight.observeRowElements([el]);
  }, [dynamicRowHeight, index]);

  const date = DATE_FORMATTER.format(new Date(commit.authorTimeMs));
  const shortHash = commit.hash.slice(0, 8);
  const laneCount = row.laneColorIds.reduce(
    (count, colorId) => (colorId >= 0 ? count + 1 : count),
    0,
  );
  const rawCommitColorId = row.laneColorIds[row.laneIndex] ?? 0;
  const commitColorId = clampNonNegative(rawCommitColorId);
  const commitColor = laneColorForId(commitColorId, palette, darkMode);

  const decorationSummary =
    decorationChipSummaryByHash.get(commit.hash) ??
    summarizeDecorationChips(commit.decorations ?? []);
  const chips = decorationSummary.chips;
  const extraChipCount = decorationSummary.extraChipCount;

  const background = isSelected
    ? "bg-blue-50 dark:bg-blue-950/40"
    : "bg-transparent hover:bg-setta-50 dark:hover:bg-setta-900/60";

  return (
    <div
      style={style}
      ref={rowRef}
      data-react-window-index={index}
      className="w-full"
    >
      <button
        type="button"
        className={`grid h-[28px] w-full items-center gap-2 px-3 text-left text-xs text-setta-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300 dark:text-setta-100 ${background}`}
        style={{ gridTemplateColumns: COMMIT_GRID_TEMPLATE_COLUMNS }}
        onClick={() => {
          if (isSelected) {
            clearGitGraphSelectedCommit();
            return;
          }
          void selectGitCommit(commit.hash);
        }}
      >
        <div className="flex items-center">
          <GitGraphCell
            laneIndex={row.laneIndex}
            laneColorIds={row.laneColorIds}
            laneStartIndices={row.laneStartIndices}
            laneEndIndices={row.laneEndIndices}
            joinFromLaneIndices={row.joinFromLaneIndices}
            mergeToLaneIndices={row.mergeToLaneIndices}
            palette={palette}
            darkMode={darkMode}
            viewBoxWidth={graphViewBoxWidth}
            laneWidth={laneWidth}
          />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1 overflow-hidden">
            {chips.map((chip) => (
              <DecorationPill
                key={`${chip.kind}-${chip.label}`}
                chip={chip}
                laneColor={commitColor}
              />
            ))}
            {extraChipCount > 0 && (
              <span className="inline-flex shrink-0 items-center rounded-full border border-setta-200 bg-setta-50 px-2 py-0.5 text-[10px] font-semibold text-setta-600 dark:border-setta-800 dark:bg-setta-900 dark:text-setta-300">
                +{extraChipCount}
              </span>
            )}
            <span className="min-w-0 flex-1 truncate">{commit.subject}</span>
          </div>
        </div>
        <div className="min-w-0 truncate text-setta-500 dark:text-setta-400">
          {commit.authorName}
        </div>
        <div className="min-w-0 truncate text-setta-500 dark:text-setta-400">
          {date}
        </div>
        <div className="min-w-0 truncate font-mono text-[11px] text-setta-500 dark:text-setta-400">
          {shortHash}
        </div>
        <span className="sr-only">lanes {laneCount}</span>
      </button>

      {isSelected && (
        <div className="border-b border-setta-200/70 bg-setta-50/60 px-3 dark:border-setta-800/70 dark:bg-setta-900/20">
          <div
            className="grid gap-2"
            style={{ gridTemplateColumns: COMMIT_GRID_TEMPLATE_COLUMNS }}
          >
            <ExpandedGraphGutter
              laneColorIds={row.laneColorIds}
              laneEndIndices={row.laneEndIndices}
              joinFromLaneIndices={row.joinFromLaneIndices}
              palette={palette}
              darkMode={darkMode}
              viewBoxWidth={graphViewBoxWidth}
              laneWidth={laneWidth}
            />
            <div className="col-span-4 min-w-0 py-3">
              <SelectedCommitDetails commitHash={commit.hash} />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SelectedCommitDetails({ commitHash }: { commitHash: string }) {
  const {
    selectedCommitDetails,
    selectedCommitDetailsIsLoading,
    selectedCommitDetailsError,
    selectedFilePath,
  } = useGitStore((state) => {
    if (!state.graph || state.graph.selectedCommitHash !== commitHash) {
      return {
        selectedCommitDetails: null,
        selectedCommitDetailsIsLoading: false,
        selectedCommitDetailsError: null,
        selectedFilePath: null,
      };
    }
    return {
      selectedCommitDetails: state.graph.selectedCommitDetails,
      selectedCommitDetailsIsLoading:
        state.graph.selectedCommitDetailsIsLoading,
      selectedCommitDetailsError: state.graph.selectedCommitDetailsError,
      selectedFilePath: state.graph.selectedCommitFilePath,
    };
  });

  if (selectedCommitDetailsIsLoading) {
    return (
      <div className="text-xs text-setta-500 dark:text-setta-300">
        Loading commit details…
      </div>
    );
  }
  if (selectedCommitDetailsError) {
    return (
      <div className="rounded-md border border-red-200 bg-red-50 px-2 py-2 text-[11px] text-red-900 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-200">
        {selectedCommitDetailsError}
      </div>
    );
  }
  if (
    selectedCommitDetails &&
    selectedCommitDetails.commitHash === commitHash
  ) {
    return (
      <ExpandedCommitRow
        details={selectedCommitDetails}
        selectedFilePath={selectedFilePath}
      />
    );
  }
  return (
    <div className="text-xs text-setta-500 dark:text-setta-300">
      No details available.
    </div>
  );
}

function ExpandedGraphGutter({
  laneColorIds,
  laneEndIndices,
  joinFromLaneIndices,
  palette,
  darkMode,
  viewBoxWidth,
  laneWidth,
}: {
  laneColorIds: number[];
  laneEndIndices: number[];
  joinFromLaneIndices: number[];
  palette: readonly string[];
  darkMode: boolean;
  viewBoxWidth: number;
  laneWidth: number;
}) {
  const blockedLaneIndices = new Set<number>([
    ...laneEndIndices,
    ...joinFromLaneIndices,
  ]);
  const normalizedLaneWidth = Math.max(1, laneWidth);
  const xForLane = (idx: number) =>
    Math.round(idx * normalizedLaneWidth + normalizedLaneWidth / 2);
  const normalizedWidth = Math.max(1, viewBoxWidth);

  return (
    <div
      data-testid="git-graph-expanded-gutter"
      className="pointer-events-none relative min-h-[52px]"
      aria-hidden="true"
    >
      {laneColorIds.map((colorId, idx) => {
        if (colorId < 0 || blockedLaneIndices.has(idx)) {
          return null;
        }
        const color = laneColorForId(colorId, palette, darkMode);
        const leftPct = (xForLane(idx) / normalizedWidth) * 100;
        return (
          <span
            key={`expanded-lane-${idx}`}
            className="absolute bottom-0 top-0 w-[2px] -translate-x-1/2 rounded-full"
            style={{ left: `${leftPct}%`, backgroundColor: color }}
          />
        );
      })}
    </div>
  );
}

function ExpandedCommitRow({
  details,
  selectedFilePath,
}: {
  details: CommitDetailsResponse;
  selectedFilePath: string | null;
}) {
  const parents = details.parents ?? [];
  const files = details.files ?? [];
  const parentsLabel = parents.map((p) => p.slice(0, 8)).join(" ");
  const authorDate = DATE_FORMATTER.format(new Date(details.authorTimeMs));
  const committerDate = DATE_FORMATTER.format(
    new Date(details.committerTimeMs),
  );
  const showCommitter =
    details.committerName !== details.authorName ||
    details.committerEmail !== details.authorEmail ||
    details.committerTimeMs !== details.authorTimeMs;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-[minmax(0,1fr)_minmax(240px,380px)]">
      <div className="min-w-0">
        <div className="grid grid-cols-[84px_1fr] gap-x-2 gap-y-1 text-[11px] text-setta-600 dark:text-setta-300">
          <div className="font-bold uppercase tracking-[0.18em] text-setta-400 dark:text-setta-500">
            Commit
          </div>
          <div className="min-w-0 truncate font-mono text-setta-700 dark:text-setta-200">
            {details.commitHash}
          </div>

          <div className="font-bold uppercase tracking-[0.18em] text-setta-400 dark:text-setta-500">
            Parents
          </div>
          <div className="min-w-0 truncate font-mono text-setta-700 dark:text-setta-200">
            {parentsLabel || "-"}
          </div>

          <div className="font-bold uppercase tracking-[0.18em] text-setta-400 dark:text-setta-500">
            Author
          </div>
          <div className="min-w-0 truncate text-setta-700 dark:text-setta-200">
            {details.authorName} · {authorDate}
          </div>

          {showCommitter && (
            <>
              <div className="font-bold uppercase tracking-[0.18em] text-setta-400 dark:text-setta-500">
                Committer
              </div>
              <div className="min-w-0 truncate text-setta-700 dark:text-setta-200">
                {details.committerName} · {committerDate}
              </div>
            </>
          )}
        </div>

        <div className="mt-2 min-w-0">
          <div className="text-xs font-semibold text-setta-900 dark:text-setta-50">
            {details.subject}
          </div>
          {details.body.trim() && (
            <pre className="mt-1 max-h-40 overflow-y-auto whitespace-pre-wrap text-xs text-setta-700 dark:text-setta-200">
              {details.body}
            </pre>
          )}
        </div>
      </div>

      <div className="min-w-0">
        <div className="mb-1 flex items-center justify-between">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-setta-400 dark:text-setta-500">
            Files changed
          </div>
          <div className="text-[11px] text-setta-400 dark:text-setta-500">
            {files.length}
          </div>
        </div>

        {files.length === 0 ? (
          <div className="rounded-md border border-setta-200 bg-white px-2 py-2 text-[11px] text-setta-500 dark:border-setta-800 dark:bg-setta-950 dark:text-setta-400">
            None
          </div>
        ) : (
          <ul
            data-testid="git-graph-files-list"
            className="max-h-56 overflow-y-auto overflow-x-hidden rounded-md border border-setta-200 bg-white dark:border-setta-800 dark:bg-setta-950"
          >
            {files.map((file) => (
              <li key={`${file.status}-${file.oldPath ?? ""}-${file.path}`}>
                <CommitFileRow
                  file={file}
                  isSelected={selectedFilePath === file.path}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function CommitFileRow({
  file,
  isSelected,
}: {
  file: CommitChangedFile;
  isSelected: boolean;
}) {
  const additions =
    file.additions === null || file.additions === undefined
      ? "-"
      : file.additions.toString();
  const deletions =
    file.deletions === null || file.deletions === undefined
      ? "-"
      : file.deletions.toString();

  const base =
    "flex w-full items-center gap-2 overflow-hidden px-2 py-1 text-left text-[11px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-300";
  const background = isSelected
    ? "bg-blue-50 dark:bg-blue-950/40"
    : "hover:bg-setta-50 dark:hover:bg-setta-900/60";
  const category = gitFileStatusCategoryFromCommitFile(file);
  const visuals = gitFileStatusVisuals(category);

  return (
    <button
      type="button"
      className={`${base} ${background}`}
      data-file-status-category={category}
      onClick={() =>
        void selectGitCommitFile({
          path: file.path,
          oldPath: file.oldPath ?? null,
        })
      }
    >
      <span
        className={`inline-flex w-10 shrink-0 items-center justify-center rounded-md px-1 py-0.5 font-mono text-[11px] font-semibold ${visuals.badgeClassName}`}
        data-file-status-category={category}
      >
        {file.status}
      </span>

      <span className="block min-w-0 flex-1 truncate font-mono text-setta-800 dark:text-setta-100">
        {file.oldPath && file.oldPath !== file.path ? (
          <>
            <span className="text-setta-500 dark:text-setta-400">
              {file.oldPath}
            </span>
            <span className="text-setta-400 dark:text-setta-500"> -&gt; </span>
            <PathWithMutedDir path={file.path} />
          </>
        ) : (
          <PathWithMutedDir path={file.path} />
        )}
      </span>

      <span className="shrink-0 font-mono text-[11px] text-setta-400 dark:text-setta-500">
        +{additions} | -{deletions}
      </span>
    </button>
  );
}

function PathWithMutedDir({ path }: { path: string }) {
  const idx = path.lastIndexOf("/");
  if (idx === -1) {
    return <span>{path}</span>;
  }
  const dir = path.slice(0, idx + 1);
  const base = path.slice(idx + 1);
  return (
    <>
      <span className="text-setta-400 dark:text-setta-500">{dir}</span>
      <span className="text-setta-800 dark:text-setta-100">{base}</span>
    </>
  );
}

export function ColumnResizeHandle({
  dataTestId,
  label,
  edge,
  onPointerDown,
}: {
  dataTestId: string;
  label: string;
  edge: "left" | "right";
  onPointerDown: (event: React.PointerEvent<HTMLDivElement>) => void;
}) {
  const rootPositionClass =
    edge === "left" ? "left-0 -translate-x-1/2" : "right-0 translate-x-1/2";
  return (
    <div
      data-testid={dataTestId}
      role="separator"
      aria-label={label}
      className={`group/col-resize absolute top-0 z-10 h-full w-6 cursor-col-resize ${rootPositionClass}`}
      onPointerDown={onPointerDown}
    >
      <div className="pointer-events-none absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-setta-300 group-hover/col-resize:bg-blue-400 dark:bg-setta-700 dark:group-hover/col-resize:bg-blue-400" />
    </div>
  );
}

function rgbFromHex(hex: string): [number, number, number] | null {
  const value = hex.startsWith("#") ? hex.slice(1) : hex;
  if (value.length !== 6) {
    return null;
  }
  const r = Number.parseInt(value.slice(0, 2), 16);
  const g = Number.parseInt(value.slice(2, 4), 16);
  const b = Number.parseInt(value.slice(4, 6), 16);
  if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
    return null;
  }
  return [r, g, b];
}

function rgbaFromHex(hex: string, alpha: number): string {
  const rgb = rgbFromHex(hex);
  if (!rgb) {
    return hex;
  }
  const [r, g, b] = rgb;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function DecorationPill({
  chip,
  laneColor,
}: {
  chip: DecorationChip;
  laneColor: string;
}) {
  const base =
    "inline-flex shrink-0 max-w-[160px] items-center truncate rounded-full border px-2 py-0.5 text-[10px] font-semibold";

  if (
    chip.kind === "head" ||
    chip.kind === "branch" ||
    chip.kind === "remote" ||
    chip.kind === "symbolic"
  ) {
    return (
      <span
        className={base}
        data-decoration-kind={chip.kind}
        style={{
          borderColor: rgbaFromHex(laneColor, 0.6),
          backgroundColor: rgbaFromHex(laneColor, 0.12),
          color: laneColor,
        }}
        title={chip.label}
      >
        {chip.label}
      </span>
    );
  }
  if (chip.kind === "tag") {
    return (
      <span
        className={`${base} border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-200`}
        data-decoration-kind={chip.kind}
        title={chip.label}
      >
        {chip.label}
      </span>
    );
  }
  return (
    <span
      className={`${base} border-setta-200 bg-white text-setta-700 dark:border-setta-800 dark:bg-setta-950 dark:text-setta-200`}
      data-decoration-kind={chip.kind}
      title={chip.label}
    >
      {chip.label}
    </span>
  );
}

function GitGraphCell({
  laneIndex,
  laneColorIds,
  laneStartIndices,
  laneEndIndices,
  joinFromLaneIndices,
  mergeToLaneIndices,
  palette,
  darkMode,
  viewBoxWidth,
  laneWidth,
}: {
  laneIndex: number;
  laneColorIds: number[];
  laneStartIndices: number[];
  laneEndIndices: number[];
  joinFromLaneIndices: number[];
  mergeToLaneIndices: number[];
  palette: readonly string[];
  darkMode: boolean;
  viewBoxWidth: number;
  laneWidth: number;
}) {
  const height = ROW_HEIGHT;
  const width = Math.max(1, viewBoxWidth);
  const centerY = height / 2;
  // Keep strokes fully opaque so curves don't blend with underlying lanes and
  // appear to change color when crossing other branches.
  const strokeOpacity = 1;
  const normalizedLaneWidth = Math.max(1, laneWidth);
  const xForLane = (idx: number) =>
    Math.round(idx * normalizedLaneWidth + normalizedLaneWidth / 2);

  const rawCommitColorId = laneColorIds[laneIndex] ?? 0;
  const commitColorId = clampNonNegative(rawCommitColorId);
  const commitColor = laneColorForId(commitColorId, palette, darkMode);
  const laneStartSet = new Set(laneStartIndices);
  const laneEndSet = new Set(laneEndIndices);
  const joinFromSet = new Set(joinFromLaneIndices);
  const mergeToSet = new Set(mergeToLaneIndices);

  return (
    <svg
      width="100%"
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="block"
      aria-hidden="true"
    >
      {laneColorIds.map((colorId, idx) => {
        if (colorId < 0) {
          return null;
        }
        let y1 = laneStartSet.has(idx) ? centerY : 0;
        let y2 = laneEndSet.has(idx) ? centerY : height;
        // Join curves occupy the top half of the row for the source lane;
        // drawing the vertical lane segment here creates a "tail" artifact.
        if (joinFromSet.has(idx)) {
          y1 = Math.max(y1, centerY);
        }
        // For merge commits, the destination lane might already exist above this
        // row (e.g., when showing `--all` refs and that branch continues after
        // being merged). In that case we need to keep the lane continuous
        // through the row, otherwise it looks like the lane has a "gap".
        //
        // However, when the destination lane *starts* at this row, drawing a
        // vertical segment below the commit dot looks like a "tail" hanging off
        // the merge curve endpoint. Avoid that by suppressing the vertical
        // segment only for lanes that start at this row.
        if (mergeToSet.has(idx) && laneStartSet.has(idx)) {
          y2 = Math.min(y2, centerY);
        }
        if (y1 === y2) {
          return null;
        }
        const x = xForLane(idx);
        const color = laneColorForId(colorId, palette, darkMode);
        return (
          <line
            key={`lane-${idx}`}
            x1={x}
            x2={x}
            y1={y1}
            y2={y2}
            stroke={color}
            strokeWidth={2}
            strokeLinecap="round"
            opacity={strokeOpacity}
          />
        );
      })}

      {joinFromLaneIndices.map((fromIdx) => {
        const x1 = xForLane(fromIdx);
        const x2 = xForLane(laneIndex);
        // Use a cubic Bezier so the curve is tangent to the vertical lanes at
        // both ends (avoids a right-angle join at the commit dot).
        const controlY = centerY / 2;
        const fromColorIdRaw = laneColorIds[fromIdx] ?? commitColorId;
        const fromColorId =
          fromColorIdRaw < 0 ? commitColorId : clampNonNegative(fromColorIdRaw);
        const fromColor = laneColorForId(fromColorId, palette, darkMode);
        return (
          <path
            key={`join-${fromIdx}-to-${laneIndex}`}
            d={`M ${x1} 0 C ${x1} ${controlY} ${x2} ${controlY} ${x2} ${centerY}`}
            stroke={fromColor}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
            opacity={strokeOpacity}
          />
        );
      })}

      {mergeToLaneIndices.map((toIdx) => {
        const x1 = xForLane(laneIndex);
        const x2 = xForLane(toIdx);
        // Use a cubic Bezier so the curve is tangent to the vertical lanes at
        // both ends (avoids a right-angle turn at the commit dot).
        const controlY = (centerY + height) / 2;
        const toColorIdRaw = laneColorIds[toIdx] ?? commitColorId;
        const toColorId =
          toColorIdRaw < 0 ? commitColorId : clampNonNegative(toColorIdRaw);
        const toColor = laneColorForId(toColorId, palette, darkMode);
        return (
          <path
            key={`merge-${laneIndex}-${toIdx}`}
            d={`M ${x1} ${centerY} C ${x1} ${controlY} ${x2} ${controlY} ${x2} ${height}`}
            stroke={toColor}
            strokeWidth={2}
            strokeLinecap="round"
            fill="none"
            opacity={strokeOpacity}
          />
        );
      })}

      <circle
        cx={xForLane(laneIndex)}
        cy={centerY}
        r={3.25}
        fill={commitColor}
      />
    </svg>
  );
}
