import {
  commitParamInputValueChange,
  getParamInputPreviewState,
} from "components/Params/ParamItems/paramValueUpdates";
import type {
  GpuRetainedContentDragEvent,
  GpuRetainedContentInteractionEvent,
  GpuRetainedContentInteractionHit,
} from "gpuFlow/interactions/retainedContentInteraction";
import {
  resolveGpuRetainedRotaryValueFromPoint,
  resolveGpuRetainedSliderValueFromPoint,
  type GpuRetainedContentRangedControlDescriptor,
} from "gpuFlow/retainedContentControls";
import type { GpuRetainedContentRow } from "gpuFlow/retainedContentScene";
import type { GpuFlowScene } from "gpuFlow/scene";
import type { GpuPoint } from "gpuFlow/viewportMath";
import { useProjectState } from "state/definitions";

type ProjectGpuRetainedContentSceneApi = {
  readonly getScene: () => GpuFlowScene;
};

type ProjectGpuRetainedRangedControlRow = GpuRetainedContentRow & {
  readonly control: GpuRetainedContentRangedControlDescriptor;
};

export function isProjectGpuRetainedParamRangedControlHit(
  event: GpuRetainedContentInteractionHit,
): boolean {
  const row = getProjectGpuRetainedRangedControlRow(event);
  return Boolean(row && !row.state.disabled);
}

export function commitProjectGpuRetainedRangedControlClick(
  event: GpuRetainedContentInteractionEvent,
): boolean {
  const row = getProjectGpuRetainedRangedControlRow(event);
  if (!row || row.state.disabled) {
    return false;
  }
  commitProjectGpuRetainedRangedParamPointerValue({
    control: row.control,
    hitRect: event.hit.rect,
    paramInfoId: event.hit.ownerRowId,
    point: event.localPoint,
    sectionId: event.ownerSectionId,
  });
  return true;
}

export function handleProjectGpuRetainedRangedControlDragMove(
  event: GpuRetainedContentDragEvent,
  {
    retainedContentScene,
  }: {
    readonly retainedContentScene: ProjectGpuRetainedContentSceneApi;
  },
): boolean {
  return handleProjectGpuRetainedRangedControlDragValue(event, {
    options: { skipBackendUpdate: true },
    retainedContentScene,
  });
}

export function handleProjectGpuRetainedRangedControlDragEnd(
  event: GpuRetainedContentDragEvent,
  {
    retainedContentScene,
  }: {
    readonly retainedContentScene: ProjectGpuRetainedContentSceneApi;
  },
): boolean {
  return handleProjectGpuRetainedRangedControlDragValue(event, {
    retainedContentScene,
  });
}

function handleProjectGpuRetainedRangedControlDragValue(
  event: GpuRetainedContentDragEvent,
  {
    options,
    retainedContentScene,
  }: {
    readonly options?: { readonly skipBackendUpdate?: boolean } | undefined;
    readonly retainedContentScene: ProjectGpuRetainedContentSceneApi;
  },
): boolean {
  const row = getProjectGpuRetainedRangedControlRow(event.activeHit);
  if (!row || row.state.disabled) {
    return false;
  }
  commitProjectGpuRetainedRangedParamPointerValue({
    control: row.control,
    hitRect: event.activeHit.hit.rect,
    options,
    paramInfoId: event.activeHit.hit.ownerRowId,
    point: getProjectGpuRetainedContentDragLocalPoint({
      event,
      scene: retainedContentScene.getScene(),
    }),
    sectionId: event.activeHit.ownerSectionId,
  });
  return true;
}

function commitProjectGpuRetainedRangedParamPointerValue({
  control,
  hitRect,
  options,
  paramInfoId,
  point,
  sectionId,
}: {
  readonly control: GpuRetainedContentRangedControlDescriptor;
  readonly hitRect: GpuRetainedContentInteractionHit["hit"]["rect"];
  readonly options?: { readonly skipBackendUpdate?: boolean } | undefined;
  readonly paramInfoId: string;
  readonly point: GpuPoint;
  readonly sectionId: string;
}) {
  const projectState = useProjectState.getState();
  const previewState = getParamInputPreviewState(
    projectState,
    sectionId,
    paramInfoId,
  );
  if (!previewState) {
    throw new Error(
      `Missing GPU retained ${control.kind} param ${paramInfoId} in section ${sectionId}.`,
    );
  }
  const nextValue = resolveProjectGpuRetainedRangedValueFromPoint({
    control,
    point,
    rect: hitRect,
  });
  commitParamInputValueChange({
    nextValue,
    options,
    paramInfoId,
    previousValue: previewState.baseValue,
    previewState,
    sectionId,
  });
}

function resolveProjectGpuRetainedRangedValueFromPoint({
  control,
  point,
  rect,
}: {
  readonly control: GpuRetainedContentRangedControlDescriptor;
  readonly point: GpuPoint;
  readonly rect: GpuRetainedContentInteractionHit["hit"]["rect"];
}): number {
  if (control.kind === "slider") {
    return resolveGpuRetainedSliderValueFromPoint({ control, point, rect });
  }
  return resolveGpuRetainedRotaryValueFromPoint({ control, point, rect });
}

function getProjectGpuRetainedRangedControlRow(
  event: GpuRetainedContentInteractionHit,
): ProjectGpuRetainedRangedControlRow | null {
  if (event.hit.kind !== "control") {
    return null;
  }
  const row = event.retainedScene.rows.find(
    (candidate) => candidate.id === event.hit.ownerRowId,
  );
  if (!row?.control || !isProjectGpuRetainedRangedControl(row.control)) {
    return null;
  }
  return row as ProjectGpuRetainedRangedControlRow;
}

function isProjectGpuRetainedRangedControl(
  control: GpuRetainedContentRow["control"],
): control is GpuRetainedContentRangedControlDescriptor {
  return Boolean(
    control && (control.kind === "slider" || control.kind === "rotary"),
  );
}

function getProjectGpuRetainedContentDragLocalPoint({
  event,
  scene,
}: {
  readonly event: GpuRetainedContentDragEvent;
  readonly scene: GpuFlowScene;
}): GpuPoint {
  if (event.hit?.surfaceId === event.activeHit.surfaceId) {
    return event.hit.localPoint;
  }
  const surface = scene.contentSurfaces.find(
    (candidate) => candidate.id === event.activeHit.surfaceId,
  );
  if (!surface?.retainedScene) {
    throw new Error(
      `Missing GPU retained content drag surface ${event.activeHit.surfaceId}.`,
    );
  }
  return {
    x: event.flowPoint.x - surface.rect.x,
    y: event.flowPoint.y - surface.rect.y,
  };
}
