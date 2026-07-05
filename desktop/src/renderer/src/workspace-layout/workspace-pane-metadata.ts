import type { WorkspaceUIPaneDescriptor, WorkspaceUIPaneListResult } from "@generated/backend";

import type { PaneId } from "./types";

export interface WorkspacePaneMetadataSnapshot {
  focusedPaneId: PaneId | null;
  layoutPresent: boolean;
  paneCount: number;
  paneIds: PaneId[];
  panesById: ReadonlyMap<PaneId, WorkspaceUIPaneDescriptor>;
  readablePaneCount: number;
  writablePaneCount: number;
  workspaceId: string;
}

export function workspacePaneMetadataSnapshotFromList(
  result: WorkspaceUIPaneListResult,
): WorkspacePaneMetadataSnapshot {
  const panesById = new Map<PaneId, WorkspaceUIPaneDescriptor>();
  let focusedPaneId: PaneId | null = null;
  let readablePaneCount = 0;
  let writablePaneCount = 0;

  for (const pane of result.panes) {
    if (panesById.has(pane.paneId)) {
      throw new Error(`workspace pane metadata contains duplicate pane id ${pane.paneId}`);
    }
    panesById.set(pane.paneId, pane);
    if (pane.focused) {
      if (focusedPaneId !== null) {
        throw new Error(
          `workspace pane metadata contains multiple focused panes: ${focusedPaneId}, ${pane.paneId}`,
        );
      }
      focusedPaneId = pane.paneId;
    }
    if (pane.readModes.length > 0) {
      readablePaneCount += 1;
    }
    if (pane.writeModes.length > 0) {
      writablePaneCount += 1;
    }
  }

  return {
    focusedPaneId,
    layoutPresent: result.layoutPresent,
    paneCount: result.panes.length,
    paneIds: result.panes.map((pane) => pane.paneId),
    panesById,
    readablePaneCount,
    writablePaneCount,
    workspaceId: result.workspaceId,
  };
}

export function emptyWorkspacePaneMetadataSnapshot(
  workspaceId: string,
): WorkspacePaneMetadataSnapshot {
  return {
    focusedPaneId: null,
    layoutPresent: false,
    paneCount: 0,
    paneIds: [],
    panesById: new Map(),
    readablePaneCount: 0,
    writablePaneCount: 0,
    workspaceId,
  };
}
