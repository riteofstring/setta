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
import type { GpuRetainedContentRow } from "gpuFlow/retainedContentScene";
import {
  resolveGpuRetainedContentDragAutoScroll,
  type GpuRetainedContentScrollOffsetMap,
} from "gpuFlow/retainedContentScroll";
import type { GpuFlowScene } from "gpuFlow/scene";
import type { GpuPoint } from "gpuFlow/viewportMath";
import type { MutableRefObject } from "react";
import { flushSync } from "react-dom";
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
  ProjectGpuActiveParamCanvasPopup,
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
import { isProjectGpuRetainedParamControlDomIslandActive } from "./projectGpuRetainedParamActiveControlPolicy";
import { commitProjectGpuRetainedButtonParamClick } from "./projectGpuRetainedParamButtonAdapter";
import { handleProjectRetainedContentCanvasCommitClick } from "./projectGpuRetainedParamCanvasCommitAdapter";
import { toProjectGpuRetainedCanvasControlTarget } from "./projectGpuRetainedParamCanvasControlInput";
import { getProjectGpuRetainedCanvasPopupTarget } from "./projectGpuRetainedParamCanvasPopupTarget";
import { isProjectGpuRetainedColorPickerPopupOptionHit } from "./projectGpuRetainedParamColorPickerAdapter";
import {
  isProjectGpuRetainedDateCalendarPopupCellHit,
  isProjectGpuRetainedDateCalendarPopupNavigationHit,
} from "./projectGpuRetainedParamDateCalendarAdapter";
import { isProjectGpuRetainedDropdownPopupOptionHit } from "./projectGpuRetainedParamDropdownAdapter";
import { isProjectGpuRetainedDropzoneAttachmentDeleteHit } from "./projectGpuRetainedParamDropzoneAdapter";
import { isProjectGpuRetainedPasswordRevealHit } from "./projectGpuRetainedParamPasswordAdapter";
import type {
  ProjectGpuRetainedPasswordRevealStateMap,
  ProjectGpuRetainedPasswordRevealUpdate,
} from "./projectGpuRetainedParamPasswordRevealState";
import {
  commitProjectGpuRetainedRangedControlClick,
  handleProjectGpuRetainedRangedControlDragEnd,
  handleProjectGpuRetainedRangedControlDragMove,
  isProjectGpuRetainedParamRangedControlHit,
} from "./projectGpuRetainedParamRangedControlAdapter";
import { commitProjectGpuRetainedSwitchParamClick } from "./projectGpuRetainedParamSwitchAdapter";

type ProjectGpuRetainedContentScrollApi = {
  readonly getScene: () => GpuFlowScene;
  readonly getScrollOffsets: () => GpuRetainedContentScrollOffsetMap;
  readonly applyScrollOffsets: (
    scrollOffsets: GpuRetainedContentScrollOffsetMap,
  ) => void;
};

type ActiveParamCanvasControlHandler = (
  target: ProjectGpuRetainedParamTarget | null,
) => void;
type ActiveParamDomIslandHandler = (
  island: ProjectGpuActiveParamDomIsland | null,
) => void;
type ActiveParamPopupHandler = (
  popup: ProjectGpuActiveParamCanvasPopup | null,
) => void;
type RetainedPasswordRevealHandler = (
  update: ProjectGpuRetainedPasswordRevealUpdate,
) => void;

const EMPTY_PROJECT_GPU_RETAINED_PASSWORD_REVEALS: ProjectGpuRetainedPasswordRevealStateMap =
  new Map();

export function getProjectRetainedContentInteractionOptions({
  canEditStructure,
  onActiveParamCanvasPopupChange = ignoreProjectGpuActiveParamCanvasPopup,
  onActiveParamCanvasControlChange = ignoreProjectGpuActiveParamCanvasControl,
  onActiveParamDomIslandChange,
  onHoveredParamTargetChange,
  onPasswordRevealStateChange = ignoreProjectGpuRetainedPasswordRevealChange,
  onRetainedParamDragPreviewChange,
  passwordRevealStates = EMPTY_PROJECT_GPU_RETAINED_PASSWORD_REVEALS,
  retainedContentScroll,
  retainedParamDragSessionRef,
  zoomActivationKeyPressed,
}: {
  readonly canEditStructure: boolean;
  readonly onActiveParamCanvasPopupChange?: ActiveParamPopupHandler;
  readonly onActiveParamCanvasControlChange?: ActiveParamCanvasControlHandler;
  readonly onActiveParamDomIslandChange: ActiveParamDomIslandHandler;
  readonly onHoveredParamTargetChange: (
    target: ProjectGpuRetainedParamTarget | null,
  ) => void;
  readonly onPasswordRevealStateChange?: RetainedPasswordRevealHandler;
  readonly onRetainedParamDragPreviewChange: (
    preview: ProjectGpuRetainedParamDragPreview | null,
  ) => void;
  readonly passwordRevealStates?:
    | ProjectGpuRetainedPasswordRevealStateMap
    | undefined;
  readonly retainedContentScroll: ProjectGpuRetainedContentScrollApi;
  readonly retainedParamDragSessionRef: MutableRefObject<ProjectGpuRetainedParamDragSession | null>;
  readonly zoomActivationKeyPressed: boolean;
}) {
  return {
    disabled: () => zoomActivationKeyPressed,
    onHitClick: (event: GpuRetainedContentInteractionEvent) =>
      handleProjectRetainedContentClick(event, {
        onActiveParamCanvasPopupChange,
        onActiveParamCanvasControlChange,
        onActiveParamDomIslandChange,
        onPasswordRevealStateChange,
        passwordRevealStates,
      }),
    onHitDragCancel: (event: GpuRetainedContentDragCancelEvent) =>
      handleProjectRetainedContentDragCancel(
        event,
        onRetainedParamDragPreviewChange,
        retainedParamDragSessionRef,
      ),
    onHitDragEnd: (event: GpuRetainedContentDragEvent) =>
      handleProjectRetainedContentDragEnd(event, {
        onRetainedParamDragPreviewChange,
        retainedContentScroll,
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
        onActiveParamCanvasPopupChange,
        onActiveParamCanvasControlChange,
        onActiveParamDomIslandChange,
        onRetainedParamDragPreviewChange,
        retainedParamDragSessionRef,
      }),
    onHitPointerDown: (event: GpuRetainedContentInteractionEvent) =>
      handleProjectRetainedContentPointerDown(event, {
        canEditStructure,
        onActiveParamCanvasPopupChange,
        onActiveParamCanvasControlChange,
        onActiveParamDomIslandChange,
      }),
    onHitPointerLeave: () => onHoveredParamTargetChange(null),
    onHitPointerMove: (event: {
      readonly hit: GpuRetainedContentInteractionHit | null;
    }) =>
      onHoveredParamTargetChange(
        event.hit ? toProjectGpuRetainedParamTarget(event.hit) : null,
      ),
    onPointerDownMiss: () => {
      onActiveParamCanvasPopupChange(null);
      onActiveParamCanvasControlChange(null);
    },
    shouldHandleDragMoveHit: (event: GpuRetainedContentInteractionHit) =>
      event.hit.kind === "row" ||
      event.hit.kind === "label" ||
      event.hit.kind === "control",
    shouldHandleHit: (event: GpuRetainedContentInteractionHit) =>
      shouldHandleProjectRetainedContentHit(event, { canEditStructure }),
    shouldHandlePointerMoveHit: () => true,
    shouldStartDrag: (event: GpuRetainedContentInteractionHit) =>
      isProjectGpuRetainedParamRangedControlHit(event) ||
      (canEditStructure &&
        useMisc.getState().isSelectingParams &&
        (event.hit.kind === "row" || event.hit.kind === "label")),
  };
}

const ignoreProjectGpuActiveParamCanvasPopup = () => undefined;
const ignoreProjectGpuActiveParamCanvasControl = () => undefined;
const ignoreProjectGpuRetainedPasswordRevealChange = () => undefined;

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
  {
    onActiveParamCanvasPopupChange,
    onActiveParamCanvasControlChange,
    onActiveParamDomIslandChange,
    onPasswordRevealStateChange,
    passwordRevealStates,
  }: {
    readonly onActiveParamCanvasPopupChange: ActiveParamPopupHandler;
    readonly onActiveParamCanvasControlChange: ActiveParamCanvasControlHandler;
    readonly onActiveParamDomIslandChange: ActiveParamDomIslandHandler;
    readonly onPasswordRevealStateChange: RetainedPasswordRevealHandler;
    readonly passwordRevealStates: ProjectGpuRetainedPasswordRevealStateMap;
  },
) {
  if (useMisc.getState().isSelectingParams) {
    toggleParamSelected(event.ownerSectionId, event.hit.ownerRowId);
    return;
  }
  if (
    !isProjectRetainedParamCanvasPopupHit(event) &&
    !isProjectRetainedParamCanvasControlHit(event)
  ) {
    return;
  }
  const controlTarget = toProjectGpuRetainedCanvasControlTarget(event);
  onActiveParamCanvasControlChange(controlTarget);
  if (
    handleProjectRetainedContentCanvasCommitClick(event, {
      onActiveParamCanvasPopupChange,
      onActiveParamDomIslandChange,
      onPasswordRevealStateChange,
      passwordRevealStates,
    })
  ) {
    return;
  }
  if (event.hit.kind === "popup-background") {
    onActiveParamDomIslandChange(null);
    return;
  }
  if (
    handleProjectRetainedContentCanvasControlClick(event, {
      onActiveParamCanvasPopupChange,
    })
  ) {
    onActiveParamDomIslandChange(null);
    return;
  }
}

function handleProjectRetainedContentPointerDown(
  event: GpuRetainedContentInteractionEvent,
  {
    canEditStructure,
    onActiveParamCanvasPopupChange,
    onActiveParamCanvasControlChange,
    onActiveParamDomIslandChange,
  }: {
    readonly canEditStructure: boolean;
    readonly onActiveParamCanvasPopupChange: ActiveParamPopupHandler;
    readonly onActiveParamCanvasControlChange: ActiveParamCanvasControlHandler;
    readonly onActiveParamDomIslandChange: ActiveParamDomIslandHandler;
  },
) {
  if (useMisc.getState().isSelectingParams) {
    return;
  }
  if (
    !isProjectRetainedParamControlActivationHit(event) &&
    !isProjectRetainedParamLabelActivationHit(event, { canEditStructure })
  ) {
    return;
  }
  onActiveParamCanvasPopupChange(null);
  onActiveParamCanvasControlChange(null);
  flushSync(() => {
    onActiveParamDomIslandChange({
      activation: {
        clientPoint: {
          x: event.nativeEvent.clientX,
          y: event.nativeEvent.clientY,
        },
        kind: "pointer",
      },
      hitRecordId: event.hit.id,
      paramInfoId: event.hit.ownerRowId,
      sectionId: event.ownerSectionId,
      surfaceId: event.surfaceId,
    });
  });
}

function handleProjectRetainedContentCanvasControlClick(
  event: GpuRetainedContentInteractionEvent,
  {
    onActiveParamCanvasPopupChange,
  }: {
    readonly onActiveParamCanvasPopupChange: (
      popup: ProjectGpuActiveParamCanvasPopup | null,
    ) => void;
  },
): boolean {
  if (event.hit.kind !== "control") {
    return false;
  }
  const row = getProjectRetainedContentHitRow(event);
  if (!row?.control || row.state.disabled) {
    return false;
  }
  if (row.control.kind === "switch") {
    onActiveParamCanvasPopupChange(null);
    commitProjectGpuRetainedSwitchParamClick({
      checked: row.control.checked,
      paramInfoId: event.hit.ownerRowId,
      sectionId: event.ownerSectionId,
    });
    return true;
  }
  if (row.control.kind === "button") {
    onActiveParamCanvasPopupChange(null);
    commitProjectGpuRetainedButtonParamClick({
      paramInfoId: event.hit.ownerRowId,
      sectionId: event.ownerSectionId,
    });
    return true;
  }
  if (commitProjectGpuRetainedRangedControlClick(event)) {
    onActiveParamCanvasPopupChange(null);
    return true;
  }
  const popupTarget = getProjectGpuRetainedCanvasPopupTarget(event);
  if (popupTarget) {
    onActiveParamCanvasPopupChange(popupTarget);
    return true;
  }
  return false;
}

function handleProjectRetainedContentDragStart(
  event: GpuRetainedContentInteractionEvent,
  {
    onActiveParamCanvasPopupChange,
    onActiveParamCanvasControlChange,
    onActiveParamDomIslandChange,
    onRetainedParamDragPreviewChange,
    retainedParamDragSessionRef,
  }: {
    readonly onActiveParamCanvasPopupChange: ActiveParamPopupHandler;
    readonly onActiveParamCanvasControlChange: ActiveParamCanvasControlHandler;
    readonly onActiveParamDomIslandChange: ActiveParamDomIslandHandler;
    readonly onRetainedParamDragPreviewChange: (
      preview: ProjectGpuRetainedParamDragPreview | null,
    ) => void;
    readonly retainedParamDragSessionRef: MutableRefObject<ProjectGpuRetainedParamDragSession | null>;
  },
) {
  if (isProjectGpuRetainedParamRangedControlHit(event)) {
    retainedParamDragSessionRef.current = null;
    const controlTarget = toProjectGpuRetainedCanvasControlTarget(event);
    onActiveParamCanvasControlChange(controlTarget);
    onActiveParamCanvasPopupChange(null);
    onActiveParamDomIslandChange(null);
    return;
  }
  const projectState = useProjectState.getState();
  const session = createProjectGpuRetainedParamDragSession({
    activeParamId: event.hit.ownerRowId,
    projectState,
    sectionId: event.ownerSectionId,
    surfaceId: event.surfaceId,
  });
  retainedParamDragSessionRef.current = session;
  onActiveParamCanvasControlChange(null);
  if (session) {
    onActiveParamCanvasPopupChange(null);
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
  if (
    handleProjectGpuRetainedRangedControlDragMove(event, {
      retainedContentScene: retainedContentScroll,
    })
  ) {
    return false;
  }
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
    retainedContentScroll.applyScrollOffsets(scrollResult.scrollOffsets);
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
  retainedContentScroll.applyScrollOffsets(scrollResult.scrollOffsets);
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
    retainedContentScroll,
    retainedParamDragSessionRef,
  }: {
    readonly onRetainedParamDragPreviewChange: (
      preview: ProjectGpuRetainedParamDragPreview | null,
    ) => void;
    readonly retainedContentScroll: ProjectGpuRetainedContentScrollApi;
    readonly retainedParamDragSessionRef: MutableRefObject<ProjectGpuRetainedParamDragSession | null>;
  },
) {
  if (
    handleProjectGpuRetainedRangedControlDragEnd(event, {
      retainedContentScene: retainedContentScroll,
    })
  ) {
    return;
  }
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
  { canEditStructure }: { readonly canEditStructure: boolean },
): boolean {
  return (
    useMisc.getState().isSelectingParams ||
    isProjectRetainedParamCanvasPopupHit(event) ||
    isProjectRetainedParamCanvasControlHit(event) ||
    isProjectRetainedParamControlActivationHit(event) ||
    isProjectRetainedParamLabelActivationHit(event, { canEditStructure })
  );
}

function isProjectRetainedParamControlActivationHit(
  event: GpuRetainedContentInteractionHit,
): boolean {
  if (event.hit.kind !== "control") {
    return false;
  }
  const row = getProjectRetainedContentHitRow(event);
  return Boolean(
    row &&
      isProjectGpuRetainedParamControlDomIslandActive({
        row,
      }),
  );
}

function isProjectRetainedParamCanvasPopupHit(
  event: GpuRetainedContentInteractionHit,
): boolean {
  return (
    event.hit.kind === "popup-background" ||
    isProjectGpuRetainedColorPickerPopupOptionHit(event) ||
    isProjectGpuRetainedDropdownPopupOptionHit(event) ||
    isProjectGpuRetainedDateCalendarPopupCellHit(event) ||
    isProjectGpuRetainedDateCalendarPopupNavigationHit(event)
  );
}

function isProjectRetainedParamCanvasControlHit(
  event: GpuRetainedContentInteractionHit,
): boolean {
  if (isProjectGpuRetainedDropzoneAttachmentDeleteHit(event)) {
    return true;
  }
  if (isProjectGpuRetainedPasswordRevealHit(event)) {
    return true;
  }
  if (event.hit.kind !== "control") {
    return false;
  }
  const row = getProjectRetainedContentHitRow(event);
  return Boolean(
    row &&
      !row.state.disabled &&
      row.control &&
      row.control.commitPolicy !== "native-island",
  );
}

function getProjectRetainedContentHitRow(
  event: GpuRetainedContentInteractionHit,
): GpuRetainedContentRow | undefined {
  return event.retainedScene.rows.find(
    (candidate) => candidate.id === event.hit.ownerRowId,
  );
}

function isProjectRetainedParamLabelActivationHit(
  event: GpuRetainedContentInteractionHit,
  { canEditStructure }: { readonly canEditStructure: boolean },
): boolean {
  if (event.hit.kind !== "label" || !canEditStructure) {
    return false;
  }
  const row = event.retainedScene.rows.find(
    (candidate) => candidate.id === event.hit.ownerRowId,
  );
  if (!row || row.state.disabled) {
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
