import { ParamInput } from "components/Params/ParamItems/ParamInput";
import type {
  GpuRetainedContentDragCancelEvent,
  GpuRetainedContentDragEvent,
  GpuRetainedContentInteractionEvent,
  GpuRetainedContentInteractionHit,
} from "gpuFlow/interactions/retainedContentInteraction";
import type { GpuDomIsland } from "gpuFlow/scene";
import { useEffect, useRef, type MutableRefObject } from "react";
import { applyActiveSectionChange } from "state/actions/activeSectionController";
import { moveParamsWithBackend } from "state/actions/params/moveParams";
import { toggleParamSelected } from "state/actions/sectionInfos";
import { useMisc, useProjectState } from "state/definitions";
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

export function getProjectRetainedContentInteractionOptions({
  canEditStructure,
  onActiveParamDomIslandChange,
  onHoveredParamTargetChange,
  onRetainedParamDragPreviewChange,
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
      event.hit.kind === "row",
    shouldHandleHit: (event: GpuRetainedContentInteractionHit) =>
      shouldHandleProjectRetainedContentHit(event),
    shouldHandlePointerMoveHit: () => true,
    shouldStartDrag: (event: GpuRetainedContentInteractionHit) =>
      canEditStructure &&
      useMisc.getState().isSelectingParams &&
      event.hit.kind === "row",
  };
}

export function renderProjectGpuDomIsland(island: GpuDomIsland) {
  if (
    island.kind !== "retained-content-control" ||
    island.source.kind !== "retained-content"
  ) {
    return null;
  }
  return (
    <ProjectGpuParamDomIsland
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
  if (!isProjectRetainedParamControlActivationHit(event)) {
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
    retainedParamDragSessionRef,
  }: {
    readonly onRetainedParamDragPreviewChange: (
      preview: ProjectGpuRetainedParamDragPreview | null,
    ) => void;
    readonly retainedParamDragSessionRef: MutableRefObject<ProjectGpuRetainedParamDragSession | null>;
  },
) {
  const session = retainedParamDragSessionRef.current;
  if (!session) {
    return;
  }
  onRetainedParamDragPreviewChange(
    createProjectGpuRetainedParamDragPreview({
      hit: event.hit,
      projectState: useProjectState.getState(),
      session,
    }),
  );
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
    isProjectRetainedParamControlActivationHit(event)
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

function ProjectGpuParamDomIsland({
  paramInfoId,
  sectionId,
}: {
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

  return (
    <div
      className="grid h-full min-w-0 bg-white px-1 dark:bg-setta-900 [&_.section-value]:col-[1/-1] [&_.section-value]:row-[1/-1]"
      data-gpu-project-param-dom-island="true"
      data-param-id={paramInfoId}
      data-section-id={sectionId}
      ref={rootRef}
    >
      <ParamInput sectionId={sectionId} paramInfoId={paramInfoId} />
    </div>
  );
}
