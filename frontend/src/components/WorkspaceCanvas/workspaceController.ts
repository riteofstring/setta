import { resolveSectionDimension } from "./workspaceSceneGeometry";
import {
  getActiveViewModeTopLevelSections,
  getEffectiveSectionSnapshot,
  getRootSectionIdsForScene,
} from "./workspaceSceneProject";
import {
  WORKSPACE_SCENE_GEOMETRY,
  type WorkspaceRect,
  type WorkspaceSceneProjectState,
  type WorkspaceSize,
  type WorkspaceViewport,
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
  const viewport = resolveWorkspaceViewport(
    source.viewport,
    projectState,
    viewportSize,
  );
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

type WorkspaceActiveViewMode = {
  id: string;
  viewMode: WorkspaceSceneProjectState["projectConfig"]["viewModes"][string];
};

function resolveCanonicalWorkspaceViewportSource(
  projectState: WorkspaceSceneProjectState,
): CanonicalWorkspaceViewportSource {
  const activeViewMode = getActiveViewMode(projectState.projectConfig);
  return (
    resolveActiveViewModeViewportSource(activeViewMode) ??
    resolveProjectViewportSource(projectState)
  );
}

function getActiveViewMode(
  projectConfig: WorkspaceSceneProjectState["projectConfig"],
): WorkspaceActiveViewMode | null {
  const { activeViewModeId, viewModes } = projectConfig;
  if (!activeViewModeId) {
    return null;
  }
  const viewMode = viewModes[activeViewModeId];
  return viewMode ? { id: activeViewModeId, viewMode } : null;
}

function resolveActiveViewModeViewportSource(
  activeViewMode: WorkspaceActiveViewMode | null,
): CanonicalWorkspaceViewportSource | null {
  if (!activeViewMode) {
    return null;
  }
  if (
    activeViewMode.viewMode.viewportInitialized &&
    activeViewMode.viewMode.viewport
  ) {
    return {
      kind: `view-mode:${activeViewMode.id}`,
      viewport: activeViewMode.viewMode.viewport,
    };
  }
  return {
    kind: `view-mode:${activeViewMode.id}:pending`,
    viewport: null,
  };
}

function resolveProjectViewportSource(
  projectState: WorkspaceSceneProjectState,
): CanonicalWorkspaceViewportSource {
  const viewportInitialized = projectState.projectConfig.viewportInitialized;
  return {
    kind: `project:${viewportInitialized ? "initialized" : "pending"}`,
    viewport:
      viewportInitialized && projectState.projectConfig.viewport
        ? projectState.projectConfig.viewport
        : null,
  };
}

function resolveWorkspaceViewport(
  viewport: WorkspaceViewport | null | undefined,
  projectState: WorkspaceSceneProjectState,
  viewportSize: WorkspaceSize,
): WorkspaceViewport {
  if (viewport) {
    return normalizeWorkspaceViewport(viewport, viewportSize);
  }
  return deriveFitWorkspaceViewport(projectState, viewportSize);
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

function deriveFitWorkspaceViewport(
  projectState: WorkspaceSceneProjectState,
  viewportSize: WorkspaceSize,
): WorkspaceViewport {
  const bounds = deriveVisibleTopLevelSectionBounds(projectState);
  if (!bounds) {
    return {
      x: viewportSize.width / 2,
      y: viewportSize.height / 2,
      zoom: 1,
    };
  }
  const padding = 0.1;
  const paddedWidth = Math.max(1, bounds.width * (1 + padding));
  const paddedHeight = Math.max(1, bounds.height * (1 + padding));
  const rawZoom = Math.min(
    viewportSize.width / paddedWidth,
    viewportSize.height / paddedHeight,
  );
  const zoom = clamp(rawZoom, 0.1, 1);
  const boundsCenterX = bounds.x + bounds.width / 2;
  const boundsCenterY = bounds.y + bounds.height / 2;
  return {
    x: viewportSize.width / 2 - boundsCenterX * zoom,
    y: viewportSize.height / 2 - boundsCenterY * zoom,
    zoom,
  };
}

function deriveVisibleTopLevelSectionBounds(
  projectState: WorkspaceSceneProjectState,
) {
  const topLevelSections = getActiveViewModeTopLevelSections(projectState);
  const sectionIds = getRootSectionIdsForScene(projectState, topLevelSections);
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;
  let count = 0;

  for (const sectionId of sectionIds) {
    const bounds = deriveTopLevelSectionBounds(
      projectState,
      topLevelSections,
      sectionId,
    );
    if (!bounds) {
      continue;
    }
    minX = Math.min(minX, bounds.x);
    minY = Math.min(minY, bounds.y);
    maxX = Math.max(maxX, bounds.x + bounds.width);
    maxY = Math.max(maxY, bounds.y + bounds.height);
    count += 1;
  }

  if (count === 0) {
    return null;
  }
  return {
    x: minX,
    y: minY,
    width: maxX - minX,
    height: maxY - minY,
  };
}

function deriveTopLevelSectionBounds(
  projectState: WorkspaceSceneProjectState,
  topLevelSections: ReturnType<typeof getActiveViewModeTopLevelSections>,
  sectionId: string,
): WorkspaceRect | null {
  const layout = topLevelSections[sectionId];
  const snapshot = getEffectiveSectionSnapshot(projectState, sectionId);
  if (!layout || !snapshot) {
    return null;
  }
  const width =
    typeof layout.w === "number"
      ? layout.w
      : resolveSectionDimension(snapshot.effectiveImpl.size?.width, 250, 250);
  const height =
    typeof layout.h === "number"
      ? layout.h
      : resolveSectionDimension(
          snapshot.effectiveImpl.size?.height,
          150,
          WORKSPACE_SCENE_GEOMETRY.sectionAutoHeight,
        );
  return {
    x: layout.x,
    y: layout.y,
    width,
    height,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
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
