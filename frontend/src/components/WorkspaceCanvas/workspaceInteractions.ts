import type {
  Dispatch,
  KeyboardEvent,
  MutableRefObject,
  PointerEvent,
  SetStateAction,
  WheelEvent,
} from "react";
import { setActiveSectionIds } from "state/actions/activeSections";
import type { useProjectState } from "state/definitions";
import {
  centerWorkspaceViewportOnPoint,
  clearWorkspaceSectionBoundsDrafts,
  getWorkspaceSectionMaxScroll,
  minimapScreenToWorkspacePoint,
  panWorkspaceViewport,
  resolveWorkspaceKeyboardNavigationTarget,
  resolveWorkspaceSectionWheelScrollOffset,
  setWorkspaceActiveControlState,
  setWorkspaceActiveEditorSession,
  setWorkspaceControllerViewport,
  setWorkspaceHoveredTarget,
  setWorkspaceKeyboardFocusedTarget,
  setWorkspaceParamRowDragDraft,
  setWorkspaceSectionBoundsDrafts,
  setWorkspaceSectionScrollOffset,
  setWorkspaceSelectedSectionIds,
  setWorkspaceSelectedTarget,
  zoomWorkspaceViewportByWheelDelta,
  type WorkspaceCanvasControllerState,
  type WorkspaceSectionBoundsDraft,
} from "./workspaceController";
import {
  activateWorkspaceCanvasControl,
  commitCanvasParamValue,
  commitWorkspaceActiveEditorSession,
  commitWorkspaceParamRowDrag,
  commitWorkspaceSectionDrag,
  commitWorkspaceSectionResize,
  createWorkspaceParamRowDragDraft,
  createWorkspaceParamRowDragInteraction,
  getKeyboardActivationPoint,
  openWorkspaceActiveEditorSession,
  resolveSliderValueFromWorkspacePoint,
  resolveWorkspaceParamRowDropTarget,
} from "./workspaceInteractionOperations";
import {
  WORKSPACE_MIN_SECTION_HEIGHT,
  WORKSPACE_MIN_SECTION_WIDTH,
  WORKSPACE_PARAM_ROW_DRAG_THRESHOLD_PX,
  type WorkspaceCanvasPointerInteraction,
  type WorkspaceResizeHandleKind,
} from "./workspaceInteractionTypes";
import { dispatchWorkspaceViewportUpdate } from "./workspaceMutations";
import {
  hitTestWorkspaceScene,
  rectContainsPoint,
  screenToWorkspace,
} from "./workspaceScene";
import type {
  WorkspaceHitRegion,
  WorkspacePoint,
  WorkspaceRect,
  WorkspaceScene,
  WorkspaceViewport,
} from "./workspaceSceneTypes";

// The pointer entrypoints are dispatch tables over declared hit-region intents.
// eslint-disable-next-line complexity
export function handleWorkspacePointerDown({
  event,
  scene,
  controllerState,
  setControllerState,
  pointerInteractionRef,
  showMinimap,
  canEditLayout,
  canEditParams,
}: {
  event: PointerEvent<HTMLCanvasElement>;
  scene: WorkspaceScene;
  controllerState: WorkspaceCanvasControllerState;
  setControllerState: Dispatch<SetStateAction<WorkspaceCanvasControllerState>>;
  pointerInteractionRef: MutableRefObject<WorkspaceCanvasPointerInteraction | null>;
  showMinimap: boolean;
  canEditLayout: boolean;
  canEditParams: boolean;
}) {
  if (event.button !== 0) {
    return;
  }
  const screenPoint = getCanvasEventPoint(event);
  const hit = getWorkspaceCanvasHit(scene, screenPoint, showMinimap);
  const intent = hit?.intent ?? "pan-viewport";
  const target = hit?.target ?? ({ kind: "workspace" } as const);
  setControllerState((current) => setWorkspaceHoveredTarget(current, target));

  if (target.kind === "workspace" || intent === "pan-viewport") {
    beginCanvasPointerInteraction(event, pointerInteractionRef, {
      kind: "pan-viewport",
      pointerId: event.pointerId,
      startScreen: screenPoint,
      startViewport: scene.viewport,
    });
    setActiveSectionIds([]);
    setControllerState((current) => ({
      ...setWorkspaceKeyboardFocusedTarget(
        setWorkspaceSelectedTarget(
          setWorkspaceSelectedSectionIds(current, []),
          { kind: "workspace" },
        ),
        { kind: "workspace" },
      ),
      activeControlState: null,
    }));
    return;
  }

  if (target.kind === "minimap") {
    beginCanvasPointerInteraction(event, pointerInteractionRef, {
      kind: "minimap-pan",
      pointerId: event.pointerId,
    });
    updateViewportFromMinimapPoint({
      scene,
      screenPoint,
      setControllerState,
      immediate: false,
    });
    return;
  }

  if (target.kind === "section") {
    const nextSelectedSectionIds = resolvePointerSectionSelection({
      selectedSectionIds: controllerState.selectedSectionIds,
      sectionId: target.sectionId,
      additive: event.shiftKey || event.metaKey || event.ctrlKey,
    });
    setActiveSectionIds(nextSelectedSectionIds);
    setControllerState((current) =>
      setWorkspaceKeyboardFocusedTarget(
        setWorkspaceSelectedTarget(
          setWorkspaceSelectedSectionIds(current, nextSelectedSectionIds),
          target,
        ),
        target,
      ),
    );

    if (intent === "scrollbar") {
      const section = scene.sectionsById[target.sectionId];
      const scrollbar =
        section?.renderModel.kind === "dict"
          ? section.renderModel.dict.scrollbar
          : null;
      if (scrollbar) {
        const scrollRange = Math.max(
          0,
          scrollbar.contentHeight - scrollbar.viewportHeight,
        );
        beginCanvasPointerInteraction(event, pointerInteractionRef, {
          kind: "section-scrollbar",
          pointerId: event.pointerId,
          sectionId: target.sectionId,
          startScreenY: screenPoint.y,
          startOffset:
            controllerState.sectionScrollOffsets[target.sectionId] ?? 0,
          scrollRange,
          thumbTravel: Math.max(
            1,
            scrollbar.track.height - scrollbar.thumb.height,
          ),
        });
      }
      return;
    }

    if (!canEditLayout) {
      return;
    }
    if (intent === "resize-section") {
      const section = scene.sectionsById[target.sectionId];
      const handle = parseWorkspaceResizeHandle(hit?.id ?? "");
      if (!section || !handle) {
        return;
      }
      beginCanvasPointerInteraction(event, pointerInteractionRef, {
        kind: "section-resize",
        pointerId: event.pointerId,
        sectionId: target.sectionId,
        handle,
        startWorkspace: screenToWorkspace(screenPoint, scene.viewport),
        startBounds: section.worldBounds,
        currentBounds: section.worldBounds,
        moved: false,
      });
      return;
    }
    if (intent === "drag-section") {
      const dragSectionIds = nextSelectedSectionIds.includes(target.sectionId)
        ? nextSelectedSectionIds
        : [target.sectionId];
      const startBoundsById = collectSectionBounds(scene, dragSectionIds);
      beginCanvasPointerInteraction(event, pointerInteractionRef, {
        kind: "section-drag",
        pointerId: event.pointerId,
        sectionIds: Object.keys(startBoundsById),
        startWorkspace: screenToWorkspace(screenPoint, scene.viewport),
        currentWorkspace: screenToWorkspace(screenPoint, scene.viewport),
        startBoundsById,
        currentBoundsById: startBoundsById,
        moved: false,
      });
    }
    return;
  }

  if (target.kind === "dict-row" || target.kind === "control") {
    setControllerState((current) =>
      setWorkspaceKeyboardFocusedTarget(
        setWorkspaceSelectedTarget(current, target),
        target,
      ),
    );
  }

  if (target.kind === "dict-row" && intent === "drag-row" && canEditParams) {
    const interaction = createWorkspaceParamRowDragInteraction({
      scene,
      target,
      screenPoint,
      pointerId: event.pointerId,
    });
    if (interaction) {
      beginCanvasPointerInteraction(event, pointerInteractionRef, interaction);
    }
    return;
  }

  if (target.kind === "control" && canEditParams) {
    if (
      (intent === "activate-editor" || intent === "open-dom-overlay") &&
      openWorkspaceActiveEditorSession({
        scene,
        target,
        setControllerState,
      })
    ) {
      return;
    }
    const startedInteraction = activateWorkspaceCanvasControl({
      scene,
      screenPoint,
      target,
      pointerId: event.pointerId,
      setControllerState,
    });
    if (startedInteraction) {
      beginCanvasPointerInteraction(
        event,
        pointerInteractionRef,
        startedInteraction,
      );
    }
  }
}

// eslint-disable-next-line complexity
export function handleWorkspacePointerMove({
  event,
  scene,
  setControllerState,
  pointerInteractionRef,
  showMinimap,
  canEditParams,
}: {
  event: PointerEvent<HTMLCanvasElement>;
  scene: WorkspaceScene;
  controllerState: WorkspaceCanvasControllerState;
  setControllerState: Dispatch<SetStateAction<WorkspaceCanvasControllerState>>;
  pointerInteractionRef: MutableRefObject<WorkspaceCanvasPointerInteraction | null>;
  showMinimap: boolean;
  canEditParams: boolean;
}) {
  const screenPoint = getCanvasEventPoint(event);
  const interaction = pointerInteractionRef.current;
  if (!interaction) {
    const hit = getWorkspaceCanvasHit(scene, screenPoint, showMinimap);
    setControllerState((current) =>
      setWorkspaceHoveredTarget(current, hit?.target ?? null),
    );
    return;
  }
  if (interaction.pointerId !== event.pointerId) {
    return;
  }

  if (interaction.kind === "pan-viewport") {
    updateWorkspaceViewportState({
      viewport: panWorkspaceViewport(interaction.startViewport, {
        x: screenPoint.x - interaction.startScreen.x,
        y: screenPoint.y - interaction.startScreen.y,
      }),
      setControllerState,
      immediate: false,
    });
    return;
  }

  if (interaction.kind === "minimap-pan") {
    updateViewportFromMinimapPoint({
      scene,
      screenPoint,
      setControllerState,
      immediate: false,
    });
    return;
  }

  if (interaction.kind === "section-drag") {
    const currentWorkspace = screenToWorkspace(screenPoint, scene.viewport);
    const delta = {
      x: currentWorkspace.x - interaction.startWorkspace.x,
      y: currentWorkspace.y - interaction.startWorkspace.y,
    };
    const drafts: Record<string, WorkspaceSectionBoundsDraft> = {};
    for (const sectionId of interaction.sectionIds) {
      const startBounds = interaction.startBoundsById[sectionId];
      if (!startBounds) {
        continue;
      }
      drafts[sectionId] = {
        source: "drag",
        sectionId,
        worldBounds: {
          ...startBounds,
          x: startBounds.x + delta.x,
          y: startBounds.y + delta.y,
        },
      };
    }
    pointerInteractionRef.current = {
      ...interaction,
      currentWorkspace,
      currentBoundsById: Object.fromEntries(
        Object.entries(drafts).map(([sectionId, draft]) => [
          sectionId,
          draft.worldBounds,
        ]),
      ),
      moved: true,
    };
    setControllerState((current) =>
      setWorkspaceSectionBoundsDrafts(current, drafts),
    );
    return;
  }

  if (interaction.kind === "section-resize") {
    const currentWorkspace = screenToWorkspace(screenPoint, scene.viewport);
    const nextBounds = resizeWorkspaceSectionBounds({
      startBounds: interaction.startBounds,
      startWorkspace: interaction.startWorkspace,
      currentWorkspace,
      handle: interaction.handle,
    });
    pointerInteractionRef.current = {
      ...interaction,
      currentBounds: nextBounds,
      moved: true,
    };
    setControllerState((current) =>
      setWorkspaceSectionBoundsDrafts(current, {
        [interaction.sectionId]: {
          source: "resize",
          sectionId: interaction.sectionId,
          worldBounds: nextBounds,
        },
      }),
    );
    return;
  }

  if (interaction.kind === "section-scrollbar") {
    const deltaY = screenPoint.y - interaction.startScreenY;
    const ratio =
      interaction.thumbTravel <= 0
        ? 0
        : (deltaY / interaction.thumbTravel) * interaction.scrollRange;
    const nextOffset = Math.max(
      0,
      Math.min(interaction.scrollRange, interaction.startOffset + ratio),
    );
    setControllerState((current) =>
      setWorkspaceSectionScrollOffset(
        current,
        interaction.sectionId,
        nextOffset,
      ),
    );
    return;
  }

  if (interaction.kind === "param-row-drag") {
    const currentWorkspace = screenToWorkspace(screenPoint, scene.viewport);
    const moved =
      interaction.moved ||
      distanceBetweenPoints(screenPoint, interaction.startScreen) >=
        WORKSPACE_PARAM_ROW_DRAG_THRESHOLD_PX;
    const dropTarget = moved
      ? resolveWorkspaceParamRowDropTarget({
          scene,
          sectionId: interaction.sectionId,
          list: interaction.list,
          draggingParamIds: interaction.draggingParamIds,
          parentById: interaction.parentById,
          workspacePoint: currentWorkspace,
        })
      : null;
    const nextInteraction = {
      ...interaction,
      currentWorkspace,
      moved,
      dropTarget,
    };
    pointerInteractionRef.current = nextInteraction;
    setControllerState((current) =>
      setWorkspaceParamRowDragDraft(
        current,
        createWorkspaceParamRowDragDraft(nextInteraction),
      ),
    );
    return;
  }

  if (interaction.kind === "slider" && canEditParams) {
    const draftValue = resolveSliderValueFromWorkspacePoint(
      interaction,
      screenToWorkspace(screenPoint, scene.viewport),
    );
    pointerInteractionRef.current = { ...interaction, draftValue };
    setControllerState((current) =>
      setWorkspaceActiveControlState(current, {
        id: interaction.target.controlId,
        target: interaction.target,
        phase: "dragging",
        draftValue,
      }),
    );
  }
}

// eslint-disable-next-line complexity
export function handleWorkspacePointerUp({
  event,
  scene,
  controllerState,
  projectState,
  setControllerState,
  pointerInteractionRef,
  canEditLayout,
  canEditParams,
}: {
  event: PointerEvent<HTMLCanvasElement>;
  scene: WorkspaceScene;
  controllerState: WorkspaceCanvasControllerState;
  projectState: ReturnType<typeof useProjectState.getState>;
  setControllerState: Dispatch<SetStateAction<WorkspaceCanvasControllerState>>;
  pointerInteractionRef: MutableRefObject<WorkspaceCanvasPointerInteraction | null>;
  canEditLayout: boolean;
  canEditParams: boolean;
}) {
  const interaction = pointerInteractionRef.current;
  if (!interaction || interaction.pointerId !== event.pointerId) {
    return;
  }
  pointerInteractionRef.current = null;

  if (
    interaction.kind === "pan-viewport" ||
    interaction.kind === "minimap-pan"
  ) {
    dispatchWorkspaceViewportUpdate(
      controllerState.viewport?.viewport ?? scene.viewport,
      true,
    );
    return;
  }

  if (interaction.kind === "section-drag") {
    if (canEditLayout && interaction.moved) {
      commitWorkspaceSectionDrag({
        scene,
        projectState,
        interaction,
      });
    }
    setControllerState((current) => clearWorkspaceSectionBoundsDrafts(current));
    return;
  }

  if (interaction.kind === "section-resize") {
    if (canEditLayout && interaction.moved) {
      commitWorkspaceSectionResize({
        projectState,
        sectionId: interaction.sectionId,
        bounds: interaction.currentBounds,
      });
    }
    setControllerState((current) => clearWorkspaceSectionBoundsDrafts(current));
    return;
  }

  if (interaction.kind === "param-row-drag") {
    if (canEditParams && interaction.moved && interaction.dropTarget) {
      commitWorkspaceParamRowDrag(interaction);
    }
    setControllerState((current) =>
      setWorkspaceParamRowDragDraft(current, null),
    );
    return;
  }

  if (interaction.kind === "slider") {
    if (canEditParams) {
      commitCanvasParamValue({
        sectionId: interaction.target.sectionId,
        paramId: interaction.target.paramId,
        value: interaction.draftValue,
      });
    }
    setControllerState((current) =>
      setWorkspaceActiveControlState(current, null),
    );
  }
}

export function handleWorkspacePointerCancel({
  event,
  setControllerState,
  pointerInteractionRef,
}: {
  event: PointerEvent<HTMLCanvasElement>;
  setControllerState: Dispatch<SetStateAction<WorkspaceCanvasControllerState>>;
  pointerInteractionRef: MutableRefObject<WorkspaceCanvasPointerInteraction | null>;
}) {
  if (pointerInteractionRef.current?.pointerId !== event.pointerId) {
    return;
  }
  pointerInteractionRef.current = null;
  setControllerState((current) =>
    setWorkspaceParamRowDragDraft(
      setWorkspaceActiveControlState(
        clearWorkspaceSectionBoundsDrafts(current),
        null,
      ),
      null,
    ),
  );
}

export function handleWorkspaceWheel({
  event,
  scene,
  controllerState,
  setControllerState,
  showMinimap,
}: {
  event: WheelEvent<HTMLCanvasElement>;
  scene: WorkspaceScene;
  controllerState: WorkspaceCanvasControllerState;
  setControllerState: Dispatch<SetStateAction<WorkspaceCanvasControllerState>>;
  showMinimap: boolean;
}) {
  const screenPoint = getCanvasEventPoint(event);
  const hit = getWorkspaceCanvasHit(scene, screenPoint, showMinimap);
  const normalizedDelta = normalizeWheelDelta(event);
  const scrollSectionId = resolveWheelScrollSectionId(scene, screenPoint, hit);
  if (scrollSectionId) {
    const nextOffset = resolveWorkspaceSectionWheelScrollOffset({
      scene,
      sectionId: scrollSectionId,
      currentOffset: controllerState.sectionScrollOffsets[scrollSectionId] ?? 0,
      deltaY: normalizedDelta.y,
    });
    setControllerState((current) =>
      setWorkspaceSectionScrollOffset(current, scrollSectionId, nextOffset),
    );
    event.preventDefault();
    return;
  }

  if (hit?.target.kind === "minimap" && showMinimap) {
    const workspacePoint = minimapScreenToWorkspacePoint(scene, screenPoint);
    const nextViewport = centerWorkspaceViewportOnPoint({
      viewport: zoomWorkspaceViewportByWheelDelta({
        viewport: scene.viewport,
        screenPoint: {
          x: scene.viewportSize.width / 2,
          y: scene.viewportSize.height / 2,
        },
        deltaY: normalizedDelta.y,
      }),
      viewportSize: scene.viewportSize,
      workspacePoint,
    });
    updateWorkspaceViewportState({
      viewport: nextViewport,
      setControllerState,
      immediate: false,
    });
    event.preventDefault();
    return;
  }

  const nextViewport =
    event.ctrlKey || event.metaKey
      ? zoomWorkspaceViewportByWheelDelta({
          viewport: scene.viewport,
          screenPoint,
          deltaY: normalizedDelta.y,
        })
      : panWorkspaceViewport(scene.viewport, {
          x: -normalizedDelta.x,
          y: -normalizedDelta.y,
        });
  updateWorkspaceViewportState({
    viewport: nextViewport,
    setControllerState,
    immediate: false,
  });
  event.preventDefault();
}

// eslint-disable-next-line complexity
export function handleWorkspaceKeyDown({
  event,
  scene,
  controllerState,
  setControllerState,
  canEditParams,
}: {
  event: KeyboardEvent<HTMLCanvasElement>;
  scene: WorkspaceScene;
  controllerState: WorkspaceCanvasControllerState;
  setControllerState: Dispatch<SetStateAction<WorkspaceCanvasControllerState>>;
  canEditParams: boolean;
}) {
  if (event.key === "Escape") {
    setControllerState((current) =>
      setWorkspaceParamRowDragDraft(
        setWorkspaceActiveEditorSession(
          setWorkspaceActiveControlState(
            clearWorkspaceSectionBoundsDrafts(
              setWorkspaceSelectedTarget(
                setWorkspaceKeyboardFocusedTarget(current, null),
                null,
              ),
            ),
            null,
          ),
          null,
        ),
        null,
      ),
    );
    event.preventDefault();
    return;
  }
  const direction = resolveKeyboardNavigationDirection(event);
  if (direction !== null) {
    const nextTarget = resolveWorkspaceKeyboardNavigationTarget({
      scene,
      currentTarget: controllerState.keyboardFocusedTarget,
      direction,
    });
    if (nextTarget) {
      setControllerState((current) =>
        setWorkspaceKeyboardFocusedTarget(
          setWorkspaceSelectedTarget(current, nextTarget),
          nextTarget,
        ),
      );
      event.preventDefault();
    }
    return;
  }
  if (
    event.key === "Enter" &&
    controllerState.activeEditorSession &&
    canEditParams
  ) {
    commitWorkspaceActiveEditorSession({
      controllerState,
      setControllerState,
    });
    event.preventDefault();
    return;
  }
  if (
    (event.key === "Enter" || event.key === " ") &&
    controllerState.keyboardFocusedTarget &&
    canEditParams
  ) {
    const target = controllerState.keyboardFocusedTarget;
    if (
      (target.kind === "dict-row" || target.kind === "control") &&
      openWorkspaceActiveEditorSession({
        scene,
        target,
        setControllerState,
      })
    ) {
      event.preventDefault();
      return;
    }
    if (target.kind === "control") {
      activateWorkspaceCanvasControl({
        scene,
        screenPoint: getKeyboardActivationPoint(scene, target),
        target,
        pointerId: -1,
        setControllerState,
      });
      event.preventDefault();
    }
  }
}

function getCanvasEventPoint(
  event: PointerEvent<HTMLCanvasElement> | WheelEvent<HTMLCanvasElement>,
): WorkspacePoint {
  const rect = event.currentTarget.getBoundingClientRect();
  return {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function getWorkspaceCanvasHit(
  scene: WorkspaceScene,
  screenPoint: WorkspacePoint,
  showMinimap: boolean,
) {
  const hit = hitTestWorkspaceScene(scene, screenPoint);
  if (hit?.target.kind === "minimap" && !showMinimap) {
    return null;
  }
  return hit;
}

function beginCanvasPointerInteraction(
  event: PointerEvent<HTMLCanvasElement>,
  pointerInteractionRef: MutableRefObject<WorkspaceCanvasPointerInteraction | null>,
  interaction: WorkspaceCanvasPointerInteraction,
) {
  pointerInteractionRef.current = interaction;
  event.currentTarget.setPointerCapture?.(event.pointerId);
}

function updateWorkspaceViewportState({
  viewport,
  setControllerState,
  immediate,
}: {
  viewport: WorkspaceViewport;
  setControllerState: Dispatch<SetStateAction<WorkspaceCanvasControllerState>>;
  immediate: boolean;
}) {
  setControllerState((current) =>
    setWorkspaceControllerViewport(current, viewport),
  );
  dispatchWorkspaceViewportUpdate(viewport, immediate);
}

function updateViewportFromMinimapPoint({
  scene,
  screenPoint,
  setControllerState,
  immediate,
}: {
  scene: WorkspaceScene;
  screenPoint: WorkspacePoint;
  setControllerState: Dispatch<SetStateAction<WorkspaceCanvasControllerState>>;
  immediate: boolean;
}) {
  updateWorkspaceViewportState({
    viewport: centerWorkspaceViewportOnPoint({
      viewport: scene.viewport,
      viewportSize: scene.viewportSize,
      workspacePoint: minimapScreenToWorkspacePoint(scene, screenPoint),
    }),
    setControllerState,
    immediate,
  });
}

function resolvePointerSectionSelection({
  selectedSectionIds,
  sectionId,
  additive,
}: {
  selectedSectionIds: Array<string>;
  sectionId: string;
  additive: boolean;
}) {
  if (!additive) {
    return [sectionId];
  }
  if (selectedSectionIds.includes(sectionId)) {
    return selectedSectionIds.filter((id) => id !== sectionId);
  }
  return [...selectedSectionIds, sectionId];
}

function parseWorkspaceResizeHandle(
  hitRegionId: string,
): WorkspaceResizeHandleKind | null {
  if (hitRegionId.endsWith(":resize-right")) {
    return "right";
  }
  if (hitRegionId.endsWith(":resize-bottom")) {
    return "bottom";
  }
  if (hitRegionId.endsWith(":resize-corner")) {
    return "corner";
  }
  return null;
}

function collectSectionBounds(
  scene: WorkspaceScene,
  sectionIds: Array<string>,
) {
  const boundsById: Record<string, WorkspaceRect> = {};
  for (const sectionId of sectionIds) {
    const section = scene.sectionsById[sectionId];
    if (section) {
      boundsById[sectionId] = section.worldBounds;
    }
  }
  return boundsById;
}

function resizeWorkspaceSectionBounds({
  startBounds,
  startWorkspace,
  currentWorkspace,
  handle,
}: {
  startBounds: WorkspaceRect;
  startWorkspace: WorkspacePoint;
  currentWorkspace: WorkspacePoint;
  handle: WorkspaceResizeHandleKind;
}) {
  const deltaX = currentWorkspace.x - startWorkspace.x;
  const deltaY = currentWorkspace.y - startWorkspace.y;
  return {
    ...startBounds,
    width:
      handle === "right" || handle === "corner"
        ? Math.max(WORKSPACE_MIN_SECTION_WIDTH, startBounds.width + deltaX)
        : startBounds.width,
    height:
      handle === "bottom" || handle === "corner"
        ? Math.max(WORKSPACE_MIN_SECTION_HEIGHT, startBounds.height + deltaY)
        : startBounds.height,
  };
}

function normalizeWheelDelta(event: WheelEvent<HTMLCanvasElement>) {
  const multiplier =
    event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? 800 : 1;
  return {
    x: event.deltaX * multiplier,
    y: event.deltaY * multiplier,
  };
}

// eslint-disable-next-line complexity
function resolveWheelScrollSectionId(
  scene: WorkspaceScene,
  screenPoint: WorkspacePoint,
  hit: WorkspaceHitRegion | null,
): string | null {
  const workspacePoint = screenToWorkspace(screenPoint, scene.viewport);
  const target = hit?.target;
  if (
    target &&
    target.kind !== "workspace" &&
    target.kind !== "minimap" &&
    getWorkspaceSectionMaxScroll(scene, target.sectionId) > 0
  ) {
    return target.sectionId;
  }
  for (const sectionId of [...scene.sectionOrder].reverse()) {
    const section = scene.sectionsById[sectionId];
    if (
      section &&
      section.renderModel.kind === "dict" &&
      getWorkspaceSectionMaxScroll(scene, sectionId) > 0 &&
      rectContainsPoint(section.geometry.body, workspacePoint)
    ) {
      return sectionId;
    }
  }
  return null;
}

function distanceBetweenPoints(a: WorkspacePoint, b: WorkspacePoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function resolveKeyboardNavigationDirection(
  event: KeyboardEvent<HTMLCanvasElement>,
): 1 | -1 | null {
  if (event.key === "Tab") {
    return event.shiftKey ? -1 : 1;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowRight") {
    return 1;
  }
  if (event.key === "ArrowUp" || event.key === "ArrowLeft") {
    return -1;
  }
  return null;
}
