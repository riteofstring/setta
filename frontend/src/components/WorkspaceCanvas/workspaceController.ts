export type WorkspaceSceneItemKind =
  | "workspace"
  | "section"
  | "dict-row"
  | "control"
  | "minimap";

export type WorkspaceSceneTarget =
  | { kind: "workspace" }
  | {
      kind: "section";
      sectionId: string;
      sectionPath: Array<string>;
    }
  | {
      kind: "dict-row";
      sectionId: string;
      sectionPath: Array<string>;
      rowId: string;
      paramId: string;
    }
  | {
      kind: "control";
      sectionId: string;
      sectionPath: Array<string>;
      rowId: string;
      paramId: string;
      controlId: string;
    }
  | {
      kind: "minimap";
      minimapId: string;
    };

export type ActiveEditorSessionKind =
  | "text"
  | "code"
  | "combobox"
  | "color"
  | "number";

export type ActiveEditorSession = {
  id: string;
  kind: ActiveEditorSessionKind;
  target: Extract<WorkspaceSceneTarget, { kind: "dict-row" | "control" }>;
  initialValue: string;
  draftValue: string;
  openedAtSceneRevision: string;
};

export type ActiveEditorSessionOutcome =
  | { kind: "none" }
  | { kind: "commit"; session: ActiveEditorSession; value: string }
  | { kind: "cancel"; session: ActiveEditorSession };

export type ActiveEditorSessionEvent =
  | { type: "open"; session: ActiveEditorSession }
  | { type: "update-draft"; draftValue: string }
  | { type: "commit" }
  | { type: "cancel" };

export type CanvasActiveControlState = {
  id: string;
  target: Extract<WorkspaceSceneTarget, { kind: "control" }>;
  phase: "pressed" | "dragging" | "popup-open";
  draftValue: string | number | boolean | null;
};

export type WorkspaceCanvasControllerState = {
  hoveredTarget: WorkspaceSceneTarget | null;
  selectedTarget: WorkspaceSceneTarget | null;
  keyboardFocusedTarget: WorkspaceSceneTarget | null;
  activeEditorSession: ActiveEditorSession | null;
  activeControlState: CanvasActiveControlState | null;
  sectionScrollOffsets: Record<string, number>;
};

export function createWorkspaceCanvasControllerState(
  overrides: Partial<WorkspaceCanvasControllerState> = {},
): WorkspaceCanvasControllerState {
  return {
    hoveredTarget: null,
    selectedTarget: null,
    keyboardFocusedTarget: null,
    activeEditorSession: null,
    activeControlState: null,
    sectionScrollOffsets: {},
    ...overrides,
  };
}

export function reduceActiveEditorSession(
  current: ActiveEditorSession | null,
  event: ActiveEditorSessionEvent,
): {
  session: ActiveEditorSession | null;
  outcome: ActiveEditorSessionOutcome;
} {
  if (event.type === "open") {
    return { session: event.session, outcome: { kind: "none" } };
  }
  if (!current) {
    return { session: null, outcome: { kind: "none" } };
  }
  if (event.type === "update-draft") {
    return {
      session: { ...current, draftValue: event.draftValue },
      outcome: { kind: "none" },
    };
  }
  if (event.type === "commit") {
    return {
      session: null,
      outcome: {
        kind: "commit",
        session: current,
        value: current.draftValue,
      },
    };
  }
  return {
    session: null,
    outcome: {
      kind: "cancel",
      session: current,
    },
  };
}

export function setWorkspaceSectionScrollOffset(
  state: WorkspaceCanvasControllerState,
  sectionId: string,
  offset: number,
): WorkspaceCanvasControllerState {
  return {
    ...state,
    sectionScrollOffsets: {
      ...state.sectionScrollOffsets,
      [sectionId]: Math.max(0, offset),
    },
  };
}
