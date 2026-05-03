import { ParamDuplicateIndexProvider } from "components/Params/ParamDuplicateIndexContext";
import { ParamInput } from "components/Params/ParamItems/ParamInput";
import { ParamNameInput } from "components/Params/ParamItems/ParamNameInput";
import type { Connection, GpuFlowConnectionContext } from "gpuFlow/flowTypes";
import type { GpuRetainedContentConnectionOptions } from "gpuFlow/interactions/retainedContentConnection";
import type {
  GpuRetainedContentDragCancelEvent,
  GpuRetainedContentDragEvent,
  GpuRetainedContentInteractionEvent,
  GpuRetainedContentInteractionHit,
} from "gpuFlow/interactions/retainedContentInteraction";
import type {
  GpuScenePortConnectionOptions,
  GpuScenePortConnectionStart,
} from "gpuFlow/interactions/scenePortConnection";
import {
  resolveGpuRetainedContentDragAutoScroll,
  type GpuRetainedContentScrollOffsetMap,
} from "gpuFlow/retainedContentScroll";
import type { GpuDomIsland, GpuFlowScene } from "gpuFlow/scene";
import type { GpuPoint } from "gpuFlow/viewportMath";
import { subscribeToGpuViewportReposition } from "gpuFlow/viewportReposition";
import { useEffect, useRef, type MutableRefObject } from "react";
import { applyActiveSectionChange } from "state/actions/activeSectionController";
import {
  AGENTIC_EDGE_HANDLE_IDS,
  createAgenticEdgeFromConnection,
  isValidAgenticEdgeConnection,
} from "state/actions/agenticEdges";
import {
  createSharedChatEdgeFromConnection,
  isValidSharedChatEdgeConnection,
} from "state/actions/chatSharedEdges";
import { isSharedChatHandleId } from "state/actions/chatSharedHandleIds";
import {
  createEdgeFromConnection,
  isValidDataEdgeConnection,
} from "state/actions/edges";
import { moveParamsWithBackend } from "state/actions/params/moveParams";
import { buildParamDuplicateIndexIfPresent } from "state/actions/params/paramDuplicateIndex";
import {
  getCurrEffectiveCodeObjImplWithTypeGuardIfPresent,
  toggleParamSelected,
} from "state/actions/sectionInfos";
import {
  createStateMachineEdgeFromConnection,
  isValidStateMachineEdgeConnection,
  isWorkflowHandleId,
} from "state/actions/stateMachineEdges";
import { useMisc, useProjectState } from "state/definitions";
import { isBaseParamCodeObjImpl } from "utils/generatedTypes";
import {
  getProjectGpuAutoPanInsetsPx,
  getProjectGpuHandleConnectionProps,
} from "./projectGpuHandleAdapter";
import type {
  ProjectGpuActiveParamDomIsland,
  ProjectGpuRetainedParamTarget,
} from "./projectGpuLayoutAdapter";
import {
  createProjectGpuRetainedParamDragPreview,
  createProjectGpuRetainedParamDragSession,
  resolveProjectGpuRetainedParamDropMove,
  type ProjectGpuRetainedParamDragPreview,
  type ProjectGpuRetainedParamDragSession,
} from "./projectGpuParamDragAdapter";
import {
  PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID,
  PROJECT_GPU_RETAINED_PARAM_VALIDATION_PARENT_ID,
} from "./projectGpuPortalAdapter";

type ProjectGpuRetainedContentScrollApi = {
  readonly getScene: () => GpuFlowScene;
  readonly getScrollOffsets: () => GpuRetainedContentScrollOffsetMap;
  readonly onScrollOffsetsChange: (
    scrollOffsets: GpuRetainedContentScrollOffsetMap,
  ) => void;
};

export function getProjectRetainedContentInteractionOptions({
  canEditStructure,
  onActiveParamDomIslandChange,
  onHoveredParamTargetChange,
  onRetainedParamDragPreviewChange,
  retainedContentScroll,
  retainedParamDragSessionRef,
  zoomActivationKeyPressed,
}: {
  readonly canEditStructure: boolean;
  readonly onActiveParamDomIslandChange: (
    island: ProjectGpuActiveParamDomIsland | null,
  ) => void;
  readonly onHoveredParamTargetChange: (
    target: ProjectGpuRetainedParamTarget | null,
  ) => void;
  readonly onRetainedParamDragPreviewChange: (
    preview: ProjectGpuRetainedParamDragPreview | null,
  ) => void;
  readonly retainedContentScroll: ProjectGpuRetainedContentScrollApi;
  readonly retainedParamDragSessionRef: MutableRefObject<ProjectGpuRetainedParamDragSession | null>;
  readonly zoomActivationKeyPressed: boolean;
}) {
  return {
    disabled: () => zoomActivationKeyPressed,
    onHitClick: (event: GpuRetainedContentInteractionEvent) =>
      handleProjectRetainedContentClick(event, onActiveParamDomIslandChange),
    onHitDragCancel: (event: GpuRetainedContentDragCancelEvent) =>
      handleProjectRetainedContentDragCancel(
        event,
        onRetainedParamDragPreviewChange,
        retainedParamDragSessionRef,
      ),
    onHitDragEnd: (event: GpuRetainedContentDragEvent) =>
      handleProjectRetainedContentDragEnd(event, {
        onRetainedParamDragPreviewChange,
        retainedParamDragSessionRef,
      }),
    onHitDragMove: (event: GpuRetainedContentDragEvent) =>
      handleProjectRetainedContentDragMove(event, {
        onRetainedParamDragPreviewChange,
        retainedContentScroll,
        retainedParamDragSessionRef,
      }),
    onHitDragFrame: (event: GpuRetainedContentDragEvent) =>
      handleProjectRetainedContentDragFrame(event, {
        onRetainedParamDragPreviewChange,
        retainedContentScroll,
        retainedParamDragSessionRef,
      }),
    onHitDragStart: (event: GpuRetainedContentInteractionEvent) =>
      handleProjectRetainedContentDragStart(event, {
        onActiveParamDomIslandChange,
        onRetainedParamDragPreviewChange,
        retainedParamDragSessionRef,
      }),
    onHitPointerLeave: () => onHoveredParamTargetChange(null),
    onHitPointerMove: (event: {
      readonly hit: GpuRetainedContentInteractionHit | null;
    }) =>
      onHoveredParamTargetChange(
        event.hit ? toProjectGpuRetainedParamTarget(event.hit) : null,
      ),
    shouldHandleDragMoveHit: (event: GpuRetainedContentInteractionHit) =>
      event.hit.kind === "row" ||
      event.hit.kind === "label" ||
      event.hit.kind === "control",
    shouldHandleHit: (event: GpuRetainedContentInteractionHit) =>
      shouldHandleProjectRetainedContentHit(event),
    shouldHandlePointerMoveHit: () => true,
    shouldStartDrag: (event: GpuRetainedContentInteractionHit) =>
      canEditStructure &&
      useMisc.getState().isSelectingParams &&
      (event.hit.kind === "row" || event.hit.kind === "label"),
  };
}

export function getProjectRetainedContentConnectionOptions({
  canEditStructure,
  zoomActivationKeyPressed,
}: {
  readonly canEditStructure: boolean;
  readonly zoomActivationKeyPressed: boolean;
}): GpuRetainedContentConnectionOptions {
  return {
    autoPanInsetsPx: getProjectGpuAutoPanInsetsPx,
    disabled: () =>
      zoomActivationKeyPressed ||
      !canEditStructure ||
      useMisc.getState().isSelectingParams,
    isConnectionCandidateAllowed: (candidate, start) =>
      getProjectGpuHandleConnectionProps(
        start.handleId,
      ).isConnectionCandidateAllowed?.(candidate) ?? true,
    isValidConnection: isValidDataEdgeConnection,
    onConnect: createEdgeFromConnection,
  };
}

export function getProjectScenePortConnectionOptions({
  canEditStructure,
  zoomActivationKeyPressed,
}: {
  readonly canEditStructure: boolean;
  readonly zoomActivationKeyPressed: boolean;
}): GpuScenePortConnectionOptions {
  return {
    autoPanInsetsPx: getProjectGpuAutoPanInsetsPx,
    disabled: () =>
      zoomActivationKeyPressed ||
      !canEditStructure ||
      useMisc.getState().isSelectingParams,
    isConnectionCandidateAllowed: (candidate, start) =>
      getProjectGpuHandleConnectionProps(
        start.handleId,
      ).isConnectionCandidateAllowed?.(candidate) ?? true,
    isValidConnection: isValidProjectScenePortConnection,
    onConnect: createProjectScenePortConnection,
  };
}

type ProjectScenePortConnectionPolicy = {
  readonly isValidConnection: (connection: Connection) => boolean;
  readonly onConnect: (
    connection: Connection,
    context?: GpuFlowConnectionContext,
  ) => void;
};

export function getProjectScenePortConnectionPolicy(
  start: Pick<GpuScenePortConnectionStart, "handleId">,
): ProjectScenePortConnectionPolicy {
  if (isProjectAgenticHandleId(start.handleId)) {
    return {
      isValidConnection: isValidAgenticEdgeConnection,
      onConnect: createAgenticEdgeFromConnection,
    };
  }
  if (isSharedChatHandleId(start.handleId)) {
    return {
      isValidConnection: isValidSharedChatEdgeConnection,
      onConnect: createSharedChatEdgeFromConnection,
    };
  }
  if (isWorkflowHandleId(start.handleId)) {
    return {
      isValidConnection: isValidStateMachineEdgeConnection,
      onConnect: createStateMachineEdgeFromConnection,
    };
  }
  return {
    isValidConnection: isValidDataEdgeConnection,
    onConnect: createEdgeFromConnection,
  };
}

function isValidProjectScenePortConnection(
  connection: Connection,
  start: GpuScenePortConnectionStart,
): boolean {
  return getProjectScenePortConnectionPolicy(start).isValidConnection(
    connection,
  );
}

function createProjectScenePortConnection(
  connection: Connection,
  context: GpuFlowConnectionContext | undefined,
  start: GpuScenePortConnectionStart,
): void {
  getProjectScenePortConnectionPolicy(start).onConnect(connection, context);
}

function isProjectAgenticHandleId(handleId: string | null | undefined) {
  return (
    handleId === AGENTIC_EDGE_HANDLE_IDS.source ||
    handleId === AGENTIC_EDGE_HANDLE_IDS.target ||
    handleId === AGENTIC_EDGE_HANDLE_IDS.reverseStart
  );
}

export function renderProjectGpuDomIsland(island: GpuDomIsland) {
  if (island.source.kind !== "retained-content") {
    return null;
  }
  if (island.kind === "retained-content-label") {
    return (
      <ProjectGpuParamNameDomIsland
        contentRect={island.contentRect}
        domIslandId={island.id}
        paramInfoId={island.source.ownerRowId}
        sectionId={island.ownerSectionId}
      />
    );
  }
  if (island.kind !== "retained-content-control") {
    return null;
  }
  return (
    <ProjectGpuParamControlDomIsland
      contentRect={island.contentRect}
      paramInfoId={island.source.ownerRowId}
      sectionId={island.ownerSectionId}
    />
  );
}

function toProjectGpuRetainedParamTarget(
  event: GpuRetainedContentInteractionHit,
): ProjectGpuRetainedParamTarget {
  return {
    hitRecordId: event.hit.id,
    paramInfoId: event.hit.ownerRowId,
    sectionId: event.ownerSectionId,
    surfaceId: event.surfaceId,
  };
}

function handleProjectRetainedContentClick(
  event: GpuRetainedContentInteractionEvent,
  onActiveParamDomIslandChange: (
    island: ProjectGpuActiveParamDomIsland | null,
  ) => void,
) {
  if (useMisc.getState().isSelectingParams) {
    toggleParamSelected(event.ownerSectionId, event.hit.ownerRowId);
    return;
  }
  if (
    !isProjectRetainedParamControlActivationHit(event) &&
    !isProjectRetainedParamLabelActivationHit(event)
  ) {
    return;
  }
  applyActiveSectionChange({
    interaction: "input-focus",
    sectionId: event.ownerSectionId,
  });
  onActiveParamDomIslandChange({
    hitRecordId: event.hit.id,
    paramInfoId: event.hit.ownerRowId,
    sectionId: event.ownerSectionId,
    surfaceId: event.surfaceId,
  });
}

function handleProjectRetainedContentDragStart(
  event: GpuRetainedContentInteractionEvent,
  {
    onActiveParamDomIslandChange,
    onRetainedParamDragPreviewChange,
    retainedParamDragSessionRef,
  }: {
    readonly onActiveParamDomIslandChange: (
      island: ProjectGpuActiveParamDomIsland | null,
    ) => void;
    readonly onRetainedParamDragPreviewChange: (
      preview: ProjectGpuRetainedParamDragPreview | null,
    ) => void;
    readonly retainedParamDragSessionRef: MutableRefObject<ProjectGpuRetainedParamDragSession | null>;
  },
) {
  const projectState = useProjectState.getState();
  const session = createProjectGpuRetainedParamDragSession({
    activeParamId: event.hit.ownerRowId,
    projectState,
    sectionId: event.ownerSectionId,
    surfaceId: event.surfaceId,
  });
  retainedParamDragSessionRef.current = session;
  if (session) {
    onActiveParamDomIslandChange(null);
    onRetainedParamDragPreviewChange(
      createProjectGpuRetainedParamDragPreview({
        hit: event,
        projectState,
        session,
      }),
    );
  }
}

function handleProjectRetainedContentDragMove(
  event: GpuRetainedContentDragEvent,
  {
    onRetainedParamDragPreviewChange,
    retainedContentScroll,
    retainedParamDragSessionRef,
  }: {
    readonly onRetainedParamDragPreviewChange: (
      preview: ProjectGpuRetainedParamDragPreview | null,
    ) => void;
    readonly retainedContentScroll: ProjectGpuRetainedContentScrollApi;
    readonly retainedParamDragSessionRef: MutableRefObject<ProjectGpuRetainedParamDragSession | null>;
  },
): boolean {
  const session = retainedParamDragSessionRef.current;
  if (!session) {
    return false;
  }
  const scene = retainedContentScroll.getScene();
  const scrollResult = resolveGpuRetainedContentDragAutoScroll({
    point: event.flowPoint,
    scene,
    scrollOffsets: retainedContentScroll.getScrollOffsets(),
    surfaceId: session.surfaceId,
  });
  if (scrollResult.changed) {
    retainedContentScroll.onScrollOffsetsChange(scrollResult.scrollOffsets);
  }
  onRetainedParamDragPreviewChange(
    createProjectGpuRetainedParamDragPreview({
      hit: event.hit,
      pointerLocal: getProjectRetainedParamDragPointerLocal({
        event,
        scene,
        session,
      }),
      projectState: useProjectState.getState(),
      session,
    }),
  );
  return scrollResult.changed;
}

function handleProjectRetainedContentDragFrame(
  event: GpuRetainedContentDragEvent,
  {
    onRetainedParamDragPreviewChange,
    retainedContentScroll,
    retainedParamDragSessionRef,
  }: {
    readonly onRetainedParamDragPreviewChange: (
      preview: ProjectGpuRetainedParamDragPreview | null,
    ) => void;
    readonly retainedContentScroll: ProjectGpuRetainedContentScrollApi;
    readonly retainedParamDragSessionRef: MutableRefObject<ProjectGpuRetainedParamDragSession | null>;
  },
): boolean {
  const session = retainedParamDragSessionRef.current;
  if (!session) {
    return false;
  }
  const scene = retainedContentScroll.getScene();
  const scrollResult = resolveGpuRetainedContentDragAutoScroll({
    point: event.flowPoint,
    scene,
    scrollOffsets: retainedContentScroll.getScrollOffsets(),
    surfaceId: session.surfaceId,
  });
  if (!scrollResult.changed) {
    return false;
  }
  retainedContentScroll.onScrollOffsetsChange(scrollResult.scrollOffsets);
  onRetainedParamDragPreviewChange(
    createProjectGpuRetainedParamDragPreview({
      hit: event.hit,
      pointerLocal: getProjectRetainedParamDragPointerLocal({
        event,
        scene,
        session,
      }),
      projectState: useProjectState.getState(),
      session,
    }),
  );
  return true;
}

function handleProjectRetainedContentDragEnd(
  event: GpuRetainedContentDragEvent,
  {
    onRetainedParamDragPreviewChange,
    retainedParamDragSessionRef,
  }: {
    readonly onRetainedParamDragPreviewChange: (
      preview: ProjectGpuRetainedParamDragPreview | null,
    ) => void;
    readonly retainedParamDragSessionRef: MutableRefObject<ProjectGpuRetainedParamDragSession | null>;
  },
) {
  const session = retainedParamDragSessionRef.current;
  retainedParamDragSessionRef.current = null;
  onRetainedParamDragPreviewChange(null);
  if (!session) {
    return;
  }
  const move = resolveProjectGpuRetainedParamDropMove({
    event: event.hit,
    projectState: useProjectState.getState(),
    session,
  });
  if (!move) {
    return;
  }
  moveParamsWithBackend({
    newIndex: move.newIndex,
    newParentId: move.newParentId,
    paramIds: [...move.paramIds],
    sectionId: move.sectionId,
  });
}

function getProjectRetainedParamDragPointerLocal({
  event,
  scene,
  session,
}: {
  readonly event: GpuRetainedContentDragEvent;
  readonly scene: GpuFlowScene;
  readonly session: ProjectGpuRetainedParamDragSession;
}): GpuPoint | null {
  if (event.hit?.surfaceId === session.surfaceId) {
    return event.hit.localPoint;
  }
  const surface = scene.contentSurfaces.find(
    (candidate) => candidate.id === session.surfaceId,
  );
  if (!surface?.retainedScene) {
    return null;
  }
  return {
    x: event.flowPoint.x - surface.rect.x,
    y: event.flowPoint.y - surface.rect.y,
  };
}

function handleProjectRetainedContentDragCancel(
  _event: GpuRetainedContentDragCancelEvent,
  onRetainedParamDragPreviewChange: (
    preview: ProjectGpuRetainedParamDragPreview | null,
  ) => void,
  retainedParamDragSessionRef: MutableRefObject<ProjectGpuRetainedParamDragSession | null>,
) {
  retainedParamDragSessionRef.current = null;
  onRetainedParamDragPreviewChange(null);
}

function shouldHandleProjectRetainedContentHit(
  event: GpuRetainedContentInteractionHit,
): boolean {
  return (
    useMisc.getState().isSelectingParams ||
    isProjectRetainedParamControlActivationHit(event) ||
    isProjectRetainedParamLabelActivationHit(event)
  );
}

function isProjectRetainedParamControlActivationHit(
  event: GpuRetainedContentInteractionHit,
): boolean {
  if (event.hit.kind !== "control") {
    return false;
  }
  const row = event.retainedScene.rows.find(
    (candidate) => candidate.id === event.hit.ownerRowId,
  );
  return Boolean(row?.controlKind && row.controlKind !== "nested");
}

function isProjectRetainedParamLabelActivationHit(
  event: GpuRetainedContentInteractionHit,
): boolean {
  if (event.hit.kind !== "label") {
    return false;
  }
  const codeObjImpl = getCurrEffectiveCodeObjImplWithTypeGuardIfPresent(
    useProjectState.getState(),
    event.ownerSectionId,
    event.hit.ownerRowId,
    isBaseParamCodeObjImpl,
  );
  return hasProjectGpuCoreNameEditable(codeObjImpl);
}

function hasProjectGpuCoreNameEditable(codeObjImpl: unknown): boolean {
  return (
    typeof codeObjImpl === "object" &&
    codeObjImpl !== null &&
    "coreNameEditable" in codeObjImpl &&
    codeObjImpl.coreNameEditable === true
  );
}

function ProjectGpuParamControlDomIsland({
  contentRect,
  paramInfoId,
  sectionId,
}: {
  readonly contentRect: GpuDomIsland["contentRect"];
  readonly paramInfoId: string;
  readonly sectionId: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      const focusTarget = rootRef.current?.querySelector<HTMLElement>(
        [
          "[data-gpu-flow-interactive='true']",
          "button",
          "input",
          "select",
          "textarea",
          "[tabindex]:not([tabindex='-1'])",
        ].join(","),
      );
      focusTarget?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frameId);
  }, [paramInfoId, sectionId]);

  useEffect(() => subscribeToGpuViewportReposition(), []);

  return (
    <div
      className="relative h-full min-w-0 bg-white dark:bg-setta-900"
      data-gpu-project-param-dom-island="true"
      data-param-id={paramInfoId}
      data-section-id={sectionId}
      ref={rootRef}
    >
      <div
        className="absolute grid min-w-0 px-1 [&_.section-value]:col-[1/-1] [&_.section-value]:row-[1/-1]"
        style={{
          height: contentRect.height,
          left: contentRect.x,
          top: contentRect.y,
          width: contentRect.width,
        }}
      >
        <ParamInput
          sectionId={sectionId}
          paramInfoId={paramInfoId}
          tooltipParentDivId={PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID}
        />
      </div>
    </div>
  );
}

function ProjectGpuParamNameDomIsland({
  contentRect,
  domIslandId,
  paramInfoId,
  sectionId,
}: {
  readonly contentRect: GpuDomIsland["contentRect"];
  readonly domIslandId: string;
  readonly paramInfoId: string;
  readonly sectionId: string;
}) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const duplicateIndex = useProjectState((state) =>
    buildParamDuplicateIndexIfPresent(state, sectionId),
  );

  useEffect(() => {
    const frameId = requestAnimationFrame(() => {
      const focusTarget = rootRef.current?.querySelector<HTMLElement>(
        [
          "[data-gpu-flow-interactive='true']",
          "button",
          "input",
          "select",
          "textarea",
          "[tabindex]:not([tabindex='-1'])",
        ].join(","),
      );
      focusTarget?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frameId);
  }, [paramInfoId, sectionId]);

  useEffect(() => subscribeToGpuViewportReposition(), []);

  return (
    <div
      className="relative h-full min-w-0 bg-white dark:bg-setta-900"
      data-gpu-project-param-name-dom-island="true"
      data-param-id={paramInfoId}
      data-section-id={sectionId}
      id={domIslandId}
      ref={rootRef}
    >
      <div
        className="absolute grid min-w-0 px-1"
        style={{
          height: contentRect.height,
          left: contentRect.x,
          top: contentRect.y,
          width: contentRect.width,
        }}
      >
        <ParamDuplicateIndexProvider value={duplicateIndex}>
          <ParamNameInput
            bg=""
            border=""
            hasChildren={false}
            paramInfoId={paramInfoId}
            sectionId={sectionId}
            tooltipParentDivId={
              PROJECT_GPU_RETAINED_CODEMIRROR_TOOLTIP_PARENT_ID
            }
            validationBubbleContainerDivId={
              PROJECT_GPU_RETAINED_PARAM_VALIDATION_PARENT_ID
            }
            validationBubbleCoordinateSpace="viewport"
          />
        </ParamDuplicateIndexProvider>
      </div>
    </div>
  );
}
