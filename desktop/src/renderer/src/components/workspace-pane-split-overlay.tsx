import type { CSSProperties } from "react";

import type {
  WorkspacePaneLayout,
  WorkspacePaneSplitTarget,
  WorkspacePaneTabDragPayload,
} from "./workspace-pane";

type SplitColumn = "center" | "left" | "right";
type SplitRow = "bottom" | "center" | "top";

const splitTargetByCell = {
  "bottom:center": "bottom",
  "bottom:left": "bottom-left",
  "bottom:right": "bottom-right",
  "center:center": null,
  "center:left": "left",
  "center:right": "right",
  "top:center": "top",
  "top:left": "top-left",
  "top:right": "top-right",
} satisfies Record<`${SplitRow}:${SplitColumn}`, WorkspacePaneSplitTarget | null>;

export function WorkspacePaneSplitDropOverlay({
  activeMergeTarget,
  activeTarget,
  canSplit,
  draggingTab,
  layout,
  paneCount,
}: {
  activeMergeTarget: WorkspacePaneMergeDropTarget | null;
  activeTarget: WorkspacePaneSplitTarget | null;
  canSplit: boolean;
  draggingTab: WorkspacePaneTabDragPayload | null;
  layout: WorkspacePaneLayout;
  paneCount: number;
}) {
  if (!draggingTab) {
    return null;
  }
  if (!canSplit && !activeMergeTarget) {
    return (
      <div className="pointer-events-none absolute inset-0 z-[70] grid place-items-center bg-zinc-950/35">
        <div className="rounded-sm border border-zinc-700 bg-zinc-950 px-3 py-2 text-xs font-medium text-zinc-300 shadow-xl shadow-black/35">
          Four pane limit reached
        </div>
      </div>
    );
  }
  const previewStyle = activeTarget
    ? workspacePaneSplitPreviewStyle(layout, paneCount, activeTarget)
    : null;
  return (
    <div
      className="pointer-events-none absolute inset-0 z-[70] grid bg-zinc-950/12 p-2"
      data-testid="workspace-split-overlay"
      style={{
        gridTemplateColumns: "minmax(0, 1fr) 1px minmax(0, 1fr)",
        gridTemplateRows: "minmax(0, 1fr) 1px minmax(0, 1fr)",
      }}
    >
      {activeMergeTarget ? (
        <div
          className="absolute grid place-items-center rounded-sm border border-sky-200/95 bg-sky-500/16 text-[11px] font-medium uppercase tracking-[0.08em] text-sky-100 shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.18),0_18px_60px_rgb(0_0_0_/_0.45)] transition-[left,top,width,height,background-color,border-color] duration-75 ease-out"
          data-merge-pane-id={activeMergeTarget.paneId}
          data-testid="workspace-merge-preview"
          style={activeMergeTarget.style}
        >
          Drop as tab
        </div>
      ) : previewStyle ? (
        <div
          className="rounded-sm border border-zinc-100/90 bg-zinc-500/18 shadow-[inset_0_0_0_1px_rgb(255_255_255_/_0.18),0_18px_60px_rgb(0_0_0_/_0.45)] transition-[grid-column,grid-row,background-color,border-color] duration-75 ease-out"
          data-split-target={activeTarget}
          data-testid="workspace-split-preview"
          style={previewStyle}
        />
      ) : null}
    </div>
  );
}

export interface WorkspacePaneMergeDropTarget {
  paneId: string;
  style: CSSProperties;
}

export function workspacePaneMergeTargetFromPoint(
  clientX: number,
  clientY: number,
  grid: HTMLElement,
  sourcePaneId: string,
): WorkspacePaneMergeDropTarget | null {
  const gridRect = grid.getBoundingClientRect();
  const cells = Array.from(
    grid.querySelectorAll<HTMLElement>('[data-testid="workspace-pane-grid-cell"]'),
  );
  for (const cell of cells) {
    const paneId = cell.getAttribute("data-pane-id");
    if (!paneId || paneId === sourcePaneId) {
      continue;
    }
    const header = cell.querySelector<HTMLElement>('[data-testid="grid-workspace-pane-header"]');
    if (!header) {
      continue;
    }
    const headerRect = header.getBoundingClientRect();
    if (pointInsideRect(clientX, clientY, headerRect)) {
      return {
        paneId,
        style: workspacePaneMergePreviewStyle(headerRect, gridRect),
      };
    }
  }
  return null;
}

export function workspacePaneSplitTargetFromPoint(
  clientX: number,
  clientY: number,
  rect: DOMRect,
): WorkspacePaneSplitTarget | null {
  const x = (clientX - rect.left) / rect.width;
  const y = (clientY - rect.top) / rect.height;
  const column = splitColumn(x);
  const row = splitRow(y);
  if (!column || !row) {
    return null;
  }
  return splitTargetByCell[`${row}:${column}`];
}

function workspacePaneMergePreviewStyle(target: DOMRect, grid: DOMRect): CSSProperties {
  return {
    height: target.height,
    left: target.left - grid.left,
    top: target.top - grid.top,
    width: target.width,
  };
}

function pointInsideRect(clientX: number, clientY: number, rect: DOMRect) {
  return (
    clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom
  );
}

function workspacePaneSplitPreviewStyle(
  layout: WorkspacePaneLayout,
  paneCount: number,
  target: WorkspacePaneSplitTarget,
): CSSProperties {
  return (
    (paneCount === 3 ? workspacePaneSplitPreviewStyleOverrides[layout]?.[target] : undefined) ??
    workspacePaneSplitPreviewStyles[target]
  );
}

const workspacePaneSplitPreviewStyles = {
  bottom: { gridColumn: "1 / 4", gridRow: "3" },
  "bottom-left": splitGridArea("left", "bottom"),
  "bottom-right": splitGridArea("right", "bottom"),
  left: { gridColumn: "1", gridRow: "1 / 4" },
  right: { gridColumn: "3", gridRow: "1 / 4" },
  top: { gridColumn: "1 / 4", gridRow: "1" },
  "top-left": splitGridArea("left", "top"),
  "top-right": splitGridArea("right", "top"),
} satisfies Record<WorkspacePaneSplitTarget, CSSProperties>;

const workspacePaneSplitPreviewStyleOverrides: Partial<
  Record<WorkspacePaneLayout, Partial<Record<WorkspacePaneSplitTarget, CSSProperties>>>
> = {
  "bottom-split": {
    left: splitGridArea("left", "top"),
    right: splitGridArea("right", "top"),
    top: splitGridArea("left", "top"),
    "top-left": splitGridArea("left", "top"),
    "top-right": splitGridArea("right", "top"),
  },
  "left-split": {
    bottom: splitGridArea("right", "bottom"),
    "bottom-right": splitGridArea("right", "bottom"),
    right: splitGridArea("right", "top"),
    top: splitGridArea("right", "top"),
    "top-right": splitGridArea("right", "top"),
  },
  "right-split": {
    bottom: splitGridArea("left", "bottom"),
    "bottom-left": splitGridArea("left", "bottom"),
    left: splitGridArea("left", "top"),
    top: splitGridArea("left", "top"),
    "top-left": splitGridArea("left", "top"),
  },
  "top-split": {
    bottom: splitGridArea("left", "bottom"),
    "bottom-left": splitGridArea("left", "bottom"),
    "bottom-right": splitGridArea("right", "bottom"),
    right: splitGridArea("right", "bottom"),
  },
};

function splitGridArea(column: "left" | "right", row: "bottom" | "top"): CSSProperties {
  return {
    gridColumn: column === "left" ? "1" : "3",
    gridRow: row === "top" ? "1" : "3",
  };
}

function splitColumn(value: number): SplitColumn | null {
  if (value < 0 || value > 1) {
    return null;
  }
  if (value < 1 / 3) {
    return "left";
  }
  if (value > 2 / 3) {
    return "right";
  }
  return "center";
}

function splitRow(value: number): SplitRow | null {
  if (value < 0 || value > 1) {
    return null;
  }
  if (value < 1 / 3) {
    return "top";
  }
  if (value > 2 / 3) {
    return "bottom";
  }
  return "center";
}
