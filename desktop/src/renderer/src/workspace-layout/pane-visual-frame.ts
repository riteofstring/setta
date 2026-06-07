import type { WorkspaceColumn, WorkspacePane, PaneId } from "./types";

export type PaneVisualFrame = { centerY: number; paneId: PaneId; top: number };

export function columnVisualFramesForPane({
  availableHeight,
  column,
  maximizedPaneId,
  paneById,
  rowGap,
}: {
  availableHeight: number;
  column: WorkspaceColumn;
  maximizedPaneId: PaneId | null;
  paneById: ReadonlyMap<PaneId, WorkspacePane>;
  rowGap: number;
}): PaneVisualFrame[] {
  const panes = column.paneIds
    .map((paneId) => paneById.get(paneId))
    .filter((pane): pane is WorkspacePane => pane !== undefined);
  const totalWeight = panes.reduce((total, pane) => total + pane.weight, 0);
  const totalGap = rowGap * Math.max(0, panes.length - 1);
  let top = 0;
  return panes.map((pane) => {
    const height =
      pane.paneId === maximizedPaneId
        ? availableHeight
        : Math.max(42, ((availableHeight - totalGap) * pane.weight) / totalWeight);
    const frame = { centerY: top + height / 2, paneId: pane.paneId, top };
    top += height + rowGap;
    return frame;
  });
}
