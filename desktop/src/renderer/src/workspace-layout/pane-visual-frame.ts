import type { WorkspaceColumn, WorkspacePane, PaneId } from "./types";
import { paneHeightsForColumn } from "./layout-engine-helpers";

export type PaneVisualFrame = { centerY: number; paneId: PaneId; top: number };

export function columnVisualFramesForPane({
  availableHeight,
  column,
  fullSizeRows = false,
  maximizedPaneId,
  paneById,
  rowGap,
}: {
  availableHeight: number;
  column: WorkspaceColumn;
  fullSizeRows?: boolean;
  maximizedPaneId: PaneId | null;
  paneById: ReadonlyMap<PaneId, WorkspacePane>;
  rowGap: number;
}): PaneVisualFrame[] {
  const panes = column.paneIds
    .map((paneId) => paneById.get(paneId))
    .filter((pane): pane is WorkspacePane => pane !== undefined);
  const totalGap = rowGap * Math.max(0, panes.length - 1);
  const heights = paneHeightsForColumn(
    panes,
    availableHeight,
    totalGap,
    fullSizeRows,
    maximizedPaneId,
  );
  let top = 0;
  return panes.map((pane, index) => {
    const height = heights[index] ?? 42;
    const frame = { centerY: top + height / 2, paneId: pane.paneId, top };
    top += height + rowGap;
    return frame;
  });
}
