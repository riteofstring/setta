import {
  resolveSectionDimension,
  screenToWorkspace,
} from "./workspaceSceneGeometry";
import {
  getActiveViewModeTopLevelSections,
  getEffectiveSectionSnapshot,
  getRootSectionIdsForScene,
} from "./workspaceSceneProject";
import {
  WORKSPACE_SCENE_GEOMETRY,
  type WorkspacePoint,
  type WorkspaceRect,
  type WorkspaceScene,
  type WorkspaceSceneProjectState,
  type WorkspaceSize,
  type WorkspaceViewport,
} from "./workspaceSceneTypes";

export type WorkspaceSceneItemKind =
  | "workspace"
  | "section"
  | "dict-row"
  | "control"
  | "canvas-popup-option"
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
      kind: "canvas-popup-option";
      sectionId: string;
      sectionPath: Array<string>;
      rowId: string;
      paramId: string;
      controlId: string;
      popupId: string;
      optionId: string;
      value: string;
      index: number;
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

export type WorkspaceInteractionMutationContract = {
  owner: "project" | "frontend-ui-state";
  draftState: string;
  commit: string;
  cancel: string;
  undoGrouping: string;
  implementationStatus: "implemented" | "pending";
};

export const WORKSPACE_INTERACTION_MUTATION_CONTRACTS = {
  viewportPersistence: {
    owner: "project",
    draftState: "WorkspaceControllerViewportState",
    commit: "dispatchWorkspaceViewportUpdate(viewport)",
    cancel: "restore the last synced viewport source",
    undoGrouping: "coalesced debounced viewport update",
    implementationStatus: "implemented",
  },
  sectionScroll: {
    owner: "frontend-ui-state",
    draftState: "sectionScrollOffsets[sectionId]",
    commit: "controller state only; no project mutation",
    cancel: "drop the transient scroll offset",
    undoGrouping: "none",
    implementationStatus: "implemented",
  },
  sectionDrag: {
    owner: "project",
    draftState: "sectionBoundsDrafts[sectionId]",
    commit:
      "dispatchWorkspaceTopLevelSectionLayoutUpdate or moveSectionsWithBackend",
    cancel: "clear sectionBoundsDrafts",
    undoGrouping: "single section drag release",
    implementationStatus: "implemented",
  },
  sectionResize: {
    owner: "project",
    draftState: "sectionBoundsDrafts[sectionId]",
    commit: "dispatchWorkspaceTopLevelSectionLayoutUpdate or setSectionSizes",
    cancel: "clear sectionBoundsDrafts",
    undoGrouping: "single section resize release",
    implementationStatus: "implemented",
  },
  sectionReorderReparent: {
    owner: "project",
    draftState: "sectionBoundsDrafts[sectionId] plus nested drop zone",
    commit: "moveSectionsWithBackend",
    cancel: "clear sectionBoundsDrafts",
    undoGrouping: "single section drop",
    implementationStatus: "implemented",
  },
  paramReorder: {
    owner: "project",
    draftState: "paramRowDragDraft with nested Param drop target",
    commit: "moveParamsWithBackend or moveParamGroupsWithBackend",
    cancel: "clear row drag draft",
    undoGrouping: "single Param row drop",
    implementationStatus: "implemented",
  },
  canvasNativeControls: {
    owner: "project",
    draftState: "activeControlState",
    commit: "setParamEnteredValue",
    cancel: "clear activeControlState",
    undoGrouping: "single immediate control activation",
    implementationStatus: "implemented",
  },
  sliders: {
    owner: "project",
    draftState: "activeControlState.draftValue",
    commit: "setParamEnteredValue on pointer release",
    cancel: "clear activeControlState without commit",
    undoGrouping: "single slider release",
    implementationStatus: "implemented",
  },
  colorEdits: {
    owner: "project",
    draftState: "activeControlState for fixed color choices",
    commit: "setParamEnteredValue for fixed palette choices",
    cancel: "clear activeControlState",
    undoGrouping: "single color choice activation",
    implementationStatus: "implemented",
  },
  comboboxSelection: {
    owner: "project",
    draftState: "activeControlState for fixed dropdown choices",
    commit: "setParamEnteredValue for fixed choices",
    cancel: "clear activeControlState",
    undoGrouping: "single fixed choice activation",
    implementationStatus: "implemented",
  },
  textCodeDrafts: {
    owner: "project",
    draftState: "ActiveEditorSession.draftValue",
    commit:
      "reduceActiveEditorSession commit outcome plus setParamEnteredValue",
    cancel: "ActiveEditorSession cancel",
    undoGrouping: "single text/code editor commit",
    implementationStatus: "implemented",
  },
} satisfies Record<string, WorkspaceInteractionMutationContract>;

export type WorkspaceSectionBoundsDraft = {
  source: "drag" | "resize";
  sectionId: string;
  worldBounds: WorkspaceRect;
};

export type WorkspaceParamRowDropTarget = {
  sectionId: string;
  paramId: string;
  newParentId: string;
  newIndex: number;
  placement: "before" | "after" | "inside";
  indicatorRect: WorkspaceRect;
};

export type WorkspaceParamRowDragDraft = {
  sectionId: string;
  rowId: string;
  paramId: string;
  worldRect: WorkspaceRect;
  dropTarget: WorkspaceParamRowDropTarget | null;
};

export type WorkspaceControllerViewportState = {
  sourceKey: string;
  viewport: WorkspaceViewport;
};

export type WorkspaceCanvasControllerState = {
  viewport: WorkspaceControllerViewportState | null;
  hoveredTarget: WorkspaceSceneTarget | null;
  selectedTarget: WorkspaceSceneTarget | null;
  selectedSectionIds: Array<string>;
  keyboardFocusedTarget: WorkspaceSceneTarget | null;
  activeEditorSession: ActiveEditorSession | null;
  activeControlState: CanvasActiveControlState | null;
  sectionScrollOffsets: Record<string, number>;
  collapsedParamIds: Record<string, Record<string, boolean>>;
  sectionBoundsDrafts: Record<string, WorkspaceSectionBoundsDraft>;
  paramRowDragDraft: WorkspaceParamRowDragDraft | null;
};

export function createWorkspaceCanvasControllerState(
  overrides: Partial<WorkspaceCanvasControllerState> = {},
): WorkspaceCanvasControllerState {
  return {
    viewport: null,
    hoveredTarget: null,
    selectedTarget: null,
    selectedSectionIds: [],
    keyboardFocusedTarget: null,
    activeEditorSession: null,
    activeControlState: null,
    sectionScrollOffsets: {},
    collapsedParamIds: {},
    sectionBoundsDrafts: {},
    paramRowDragDraft: null,
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

export function panWorkspaceViewport(
  viewport: WorkspaceViewport,
  deltaScreen: WorkspacePoint,
): WorkspaceViewport {
  return {
    ...viewport,
    x: viewport.x + deltaScreen.x,
    y: viewport.y + deltaScreen.y,
  };
}

export function zoomWorkspaceViewportAtScreenPoint({
  viewport,
  screenPoint,
  zoom,
}: {
  viewport: WorkspaceViewport;
  screenPoint: WorkspacePoint;
  zoom: number;
}): WorkspaceViewport {
  const nextZoom = normalizeWorkspaceZoom(zoom);
  const workspacePoint = screenToWorkspace(screenPoint, viewport);
  return {
    x: screenPoint.x - workspacePoint.x * nextZoom,
    y: screenPoint.y - workspacePoint.y * nextZoom,
    zoom: nextZoom,
  };
}

export function zoomWorkspaceViewportByWheelDelta({
  viewport,
  screenPoint,
  deltaY,
}: {
  viewport: WorkspaceViewport;
  screenPoint: WorkspacePoint;
  deltaY: number;
}): WorkspaceViewport {
  const zoomFactor = Math.exp(-deltaY * 0.0015);
  return zoomWorkspaceViewportAtScreenPoint({
    viewport,
    screenPoint,
    zoom: viewport.zoom * zoomFactor,
  });
}

export function centerWorkspaceViewportOnPoint({
  viewport,
  viewportSize,
  workspacePoint,
}: {
  viewport: WorkspaceViewport;
  viewportSize: WorkspaceSize;
  workspacePoint: WorkspacePoint;
}): WorkspaceViewport {
  return {
    x: viewportSize.width / 2 - workspacePoint.x * viewport.zoom,
    y: viewportSize.height / 2 - workspacePoint.y * viewport.zoom,
    zoom: viewport.zoom,
  };
}

export function minimapScreenToWorkspacePoint(
  scene: WorkspaceScene,
  screenPoint: WorkspacePoint,
): WorkspacePoint {
  const { transform } = scene.minimap;
  return {
    x: (screenPoint.x - transform.translateX) / transform.scale,
    y: (screenPoint.y - transform.translateY) / transform.scale,
  };
}

export function setWorkspaceHoveredTarget(
  state: WorkspaceCanvasControllerState,
  hoveredTarget: WorkspaceSceneTarget | null,
): WorkspaceCanvasControllerState {
  return targetsEqual(state.hoveredTarget, hoveredTarget)
    ? state
    : { ...state, hoveredTarget };
}

export function setWorkspaceSelectedTarget(
  state: WorkspaceCanvasControllerState,
  selectedTarget: WorkspaceSceneTarget | null,
): WorkspaceCanvasControllerState {
  return targetsEqual(state.selectedTarget, selectedTarget)
    ? state
    : { ...state, selectedTarget };
}

export function setWorkspaceKeyboardFocusedTarget(
  state: WorkspaceCanvasControllerState,
  keyboardFocusedTarget: WorkspaceSceneTarget | null,
): WorkspaceCanvasControllerState {
  return targetsEqual(state.keyboardFocusedTarget, keyboardFocusedTarget)
    ? state
    : { ...state, keyboardFocusedTarget };
}

export function setWorkspaceSelectedSectionIds(
  state: WorkspaceCanvasControllerState,
  selectedSectionIds: Array<string>,
): WorkspaceCanvasControllerState {
  return stringArraysEqual(state.selectedSectionIds, selectedSectionIds)
    ? state
    : { ...state, selectedSectionIds: [...selectedSectionIds] };
}

export function setWorkspaceActiveControlState(
  state: WorkspaceCanvasControllerState,
  activeControlState: CanvasActiveControlState | null,
): WorkspaceCanvasControllerState {
  return {
    ...state,
    activeControlState,
  };
}

export function isWorkspaceParamDisclosureCollapsed(
  state: WorkspaceCanvasControllerState,
  sectionId: string,
  paramId: string,
) {
  return state.collapsedParamIds[sectionId]?.[paramId] ?? false;
}

export function setWorkspaceParamDisclosureCollapsed(
  state: WorkspaceCanvasControllerState,
  sectionId: string,
  paramId: string,
  collapsed: boolean,
): WorkspaceCanvasControllerState {
  const currentSection = state.collapsedParamIds[sectionId] ?? {};
  if ((currentSection[paramId] ?? false) === collapsed) {
    return state;
  }
  const nextSection = { ...currentSection };
  if (collapsed) {
    nextSection[paramId] = true;
  } else {
    delete nextSection[paramId];
  }
  const nextCollapsed = { ...state.collapsedParamIds };
  if (Object.keys(nextSection).length === 0) {
    delete nextCollapsed[sectionId];
  } else {
    nextCollapsed[sectionId] = nextSection;
  }
  return {
    ...state,
    collapsedParamIds: nextCollapsed,
  };
}

export function toggleWorkspaceParamDisclosureCollapsed(
  state: WorkspaceCanvasControllerState,
  sectionId: string,
  paramId: string,
): WorkspaceCanvasControllerState {
  return setWorkspaceParamDisclosureCollapsed(
    state,
    sectionId,
    paramId,
    !isWorkspaceParamDisclosureCollapsed(state, sectionId, paramId),
  );
}

export function setWorkspaceActiveEditorSession(
  state: WorkspaceCanvasControllerState,
  activeEditorSession: ActiveEditorSession | null,
): WorkspaceCanvasControllerState {
  return {
    ...state,
    activeEditorSession,
  };
}

export function setWorkspaceSectionBoundsDrafts(
  state: WorkspaceCanvasControllerState,
  sectionBoundsDrafts: Record<string, WorkspaceSectionBoundsDraft>,
): WorkspaceCanvasControllerState {
  return {
    ...state,
    sectionBoundsDrafts,
  };
}

export function clearWorkspaceSectionBoundsDrafts(
  state: WorkspaceCanvasControllerState,
): WorkspaceCanvasControllerState {
  return Object.keys(state.sectionBoundsDrafts).length === 0
    ? state
    : {
        ...state,
        sectionBoundsDrafts: {},
      };
}

export function setWorkspaceParamRowDragDraft(
  state: WorkspaceCanvasControllerState,
  paramRowDragDraft: WorkspaceParamRowDragDraft | null,
): WorkspaceCanvasControllerState {
  return {
    ...state,
    paramRowDragDraft,
  };
}

export function getWorkspaceSectionMaxScroll(
  scene: WorkspaceScene,
  sectionId: string,
): number {
  const section = scene.sectionsById[sectionId];
  if (!section || section.renderModel.kind !== "dict") {
    return 0;
  }
  const scrollbar = section.renderModel.dict.scrollbar;
  if (!scrollbar) {
    return 0;
  }
  return Math.max(0, scrollbar.contentHeight - scrollbar.viewportHeight);
}

export function resolveWorkspaceSectionWheelScrollOffset({
  scene,
  sectionId,
  currentOffset,
  deltaY,
}: {
  scene: WorkspaceScene;
  sectionId: string;
  currentOffset: number;
  deltaY: number;
}): number {
  return clamp(
    currentOffset + deltaY,
    0,
    getWorkspaceSectionMaxScroll(scene, sectionId),
  );
}

export function getWorkspaceKeyboardNavigationTargets(
  scene: WorkspaceScene,
): Array<WorkspaceSceneTarget> {
  const targets: Array<WorkspaceSceneTarget> = [];
  for (const sectionId of scene.sectionOrder) {
    const section = scene.sectionsById[sectionId];
    if (!section) {
      continue;
    }
    targets.push({
      kind: "section",
      sectionId: section.id,
      sectionPath: section.sectionPath,
    });
    if (section.renderModel.kind !== "dict") {
      continue;
    }
    for (const row of section.renderModel.dict.rows) {
      if (!row.visible) {
        continue;
      }
      targets.push({
        kind: "dict-row",
        sectionId: section.id,
        sectionPath: section.sectionPath,
        rowId: row.id,
        paramId: row.paramId,
      });
      const controlTarget =
        row.hitRegions.find(
          (
            region,
          ): region is typeof region & {
            target: Extract<WorkspaceSceneTarget, { kind: "control" }>;
          } => region.target.kind === "control",
        )?.target ?? null;
      if (controlTarget) {
        targets.push(controlTarget);
      }
    }
  }
  return targets;
}

export function resolveWorkspaceKeyboardNavigationTarget({
  scene,
  currentTarget,
  direction,
}: {
  scene: WorkspaceScene;
  currentTarget: WorkspaceSceneTarget | null;
  direction: 1 | -1;
}): WorkspaceSceneTarget | null {
  const targets = getWorkspaceKeyboardNavigationTargets(scene);
  if (targets.length === 0) {
    return null;
  }
  const currentIndex = currentTarget
    ? targets.findIndex((target) => targetsEqual(target, currentTarget))
    : -1;
  if (currentIndex < 0) {
    return direction > 0 ? targets[0] ?? null : targets.at(-1) ?? null;
  }
  return (
    targets[(currentIndex + direction + targets.length) % targets.length] ??
    null
  );
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
    zoom: normalizeWorkspaceZoom(viewport.zoom),
  };
}

function normalizeWorkspaceZoom(zoom: number) {
  return clamp(zoom, 0.05, 4);
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

function targetsEqual(
  left: WorkspaceSceneTarget | null,
  right: WorkspaceSceneTarget | null,
) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function stringArraysEqual(left: Array<string>, right: Array<string>) {
  if (left.length !== right.length) {
    return false;
  }
  return left.every((value, index) => value === right[index]);
}
