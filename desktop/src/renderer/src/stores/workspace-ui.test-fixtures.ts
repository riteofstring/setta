import type { WorkspaceUILayout, WorkspaceUIPaneOperationResult } from "@generated/backend";
import type { SettaAPI } from "@shared/types";

export function workspaceUIReadFixtureAPI(
  context: string,
): Pick<SettaAPI["workspace"], "listUIPanes" | "onUIEvent" | "readUIPane" | "readUISchema"> {
  return {
    listUIPanes: async (workspaceId) => ({
      layoutPresent: false,
      panes: [],
      schema: emptyWorkspaceUISchema(),
      workspaceId,
    }),
    onUIEvent: () => () => {},
    readUIPane: async () => {
      throw new Error(`workspace pane reads are not used by ${context}`);
    },
    readUISchema: async () => emptyWorkspaceUISchema(),
  };
}

function emptyWorkspaceUISchema(): Awaited<ReturnType<SettaAPI["workspace"]["readUISchema"]>> {
  return {
    columnWidthUnits: [],
    layoutSchemaVersion: 2,
    paneReadModes: [],
    paneRuntimeStatuses: [],
    paneTones: [],
    paneWriteModes: [],
    schemaVersion: 1,
    surfaceCloseModes: [],
    surfaceKinds: [],
  };
}

export function emptyWorkspaceUILayout(workspaceId: string): WorkspaceUILayout {
  return {
    columns: [],
    focusedPaneId: "",
    panes: [],
    revision: 1,
    schemaVersion: 3,
    workspaceId,
  };
}

export function emptyWorkspaceUIPaneOperationResult(
  workspaceId: string,
): WorkspaceUIPaneOperationResult {
  return {
    beforeAfterDimensions: [],
    changed: false,
    layout: emptyWorkspaceUILayout(workspaceId),
    operationResult: {
      close: null,
      configure: null,
      focusedPaneId: "",
      kind: "focus_pane",
      move: null,
      open: null,
      paneId: "",
      previousFocusedPaneId: "",
      rename: null,
      reorder: null,
      resize: null,
    },
    revision: 1,
    warnings: [],
    workspaceId,
  };
}
