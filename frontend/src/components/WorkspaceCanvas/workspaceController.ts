import type {
  WorkspaceSceneProjectState,
  WorkspaceSize,
  WorkspaceViewport,
} from "./workspaceSceneTypes";

export type WorkspaceSceneItemKind =
  | "workspace"
  | "section"
  | "dict-row"
  | "control"
  | "minimap";

export type WorkspaceCommitMode =
  | "none"
  | "immediate"
  | "onBlur"
  | "onEnter"
  | "onBlurOrEnter"
  | "onExplicitApply"
  | "onRelease"
  | "continuousDraft";

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
  rectKey: string;
  initialValue: string;
  draftValue: string;
  commitMode: WorkspaceCommitMode;
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

export type WorkspaceControllerViewportState = {
  sourceKey: string;
  viewport: WorkspaceViewport;
};

export type WorkspaceCanvasControllerState = {
  viewport: WorkspaceControllerViewportState | null;
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
    viewport: null,
    hoveredTarget: null,
    selectedTarget: null,
    keyboardFocusedTarget: null,
    activeEditorSession: null,
    activeControlState: null,
    sectionScrollOffsets: {},
    ...overrides,
  };
}

export function createWorkspaceControllerViewportState(
  projectState: WorkspaceSceneProjectState,
  viewportSize: WorkspaceSize,
): WorkspaceControllerViewportState {
  const source = resolveCanonicalWorkspaceViewportSource(projectState);
  const viewport = normalizeWorkspaceViewport(source.viewport, viewportSize);
  return {
    sourceKey: buildWorkspaceViewportSourceKey(
      source.kind,
      source.viewport,
      viewport,
      viewportSize,
    ),
    viewport,
  };
}

export function getWorkspaceControllerViewport(
  state: WorkspaceCanvasControllerState,
  projectState: WorkspaceSceneProjectState,
  viewportSize: WorkspaceSize,
): WorkspaceViewport {
  return (
    state.viewport ??
    createWorkspaceControllerViewportState(projectState, viewportSize)
  ).viewport;
}

export function syncWorkspaceControllerViewport(
  state: WorkspaceCanvasControllerState,
  projectState: WorkspaceSceneProjectState,
  viewportSize: WorkspaceSize,
): WorkspaceCanvasControllerState {
  const next = createWorkspaceControllerViewportState(
    projectState,
    viewportSize,
  );
  if (state.viewport?.sourceKey === next.sourceKey) {
    return state;
  }
  return {
    ...state,
    viewport: next,
  };
}

export function setWorkspaceControllerViewport(
  state: WorkspaceCanvasControllerState,
  viewport: WorkspaceViewport,
): WorkspaceCanvasControllerState {
  return {
    ...state,
    viewport: {
      sourceKey: state.viewport?.sourceKey ?? "local",
      viewport: normalizeWorkspaceViewport(viewport, {
        width: 1,
        height: 1,
      }),
    },
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

type CanonicalWorkspaceViewportSource = {
  kind: string;
  viewport: WorkspaceViewport | null | undefined;
};

function resolveCanonicalWorkspaceViewportSource(
  projectState: WorkspaceSceneProjectState,
): CanonicalWorkspaceViewportSource {
  const { activeViewModeId, viewModes } = projectState.projectConfig;
  const activeViewMode =
    activeViewModeId && viewModes[activeViewModeId]
      ? viewModes[activeViewModeId]
      : null;
  if (activeViewMode?.viewportInitialized && activeViewMode.viewport) {
    return {
      kind: `view-mode:${activeViewModeId}`,
      viewport: activeViewMode.viewport,
    };
  }
  return {
    kind: `project:${
      projectState.projectConfig.viewportInitialized ? "initialized" : "pending"
    }`,
    viewport: projectState.projectConfig.viewport,
  };
}

function normalizeWorkspaceViewport(
  viewport: WorkspaceViewport | null | undefined,
  viewportSize: WorkspaceSize,
): WorkspaceViewport {
  if (!viewport) {
    return {
      x: viewportSize.width / 2,
      y: viewportSize.height / 2,
      zoom: 1,
    };
  }
  return {
    x: viewport.x,
    y: viewport.y,
    zoom: Math.max(0.01, viewport.zoom),
  };
}

function buildWorkspaceViewportSourceKey(
  kind: string,
  canonicalViewport: WorkspaceViewport | null | undefined,
  viewport: WorkspaceViewport,
  viewportSize: WorkspaceSize,
) {
  const keyParts = [kind, viewport.x, viewport.y, viewport.zoom];
  if (!canonicalViewport) {
    keyParts.push(viewportSize.width, viewportSize.height);
  }
  return keyParts.join(":");
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
