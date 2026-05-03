import {
  commitParamInputValueChange,
  getParamInputPreviewState,
} from "components/Params/ParamItems/paramValueUpdates";
import type {
  GpuRetainedContentDragEvent,
  GpuRetainedContentInteractionEvent,
  GpuRetainedContentInteractionHit,
} from "gpuFlow/interactions/retainedContentInteraction";
import { resolveGpuRetainedSliderValueFromPoint } from "gpuFlow/retainedContentControls";
import type { GpuRetainedContentRow } from "gpuFlow/retainedContentScene";
import type { GpuFlowScene } from "gpuFlow/scene";
import type { GpuPoint } from "gpuFlow/viewportMath";
import { useProjectState } from "state/definitions";

type ProjectGpuRetainedContentSceneApi = {
  readonly getScene: () => GpuFlowScene;
};

export function isProjectGpuRetainedParamSliderControlHit(
  event: GpuRetainedContentInteractionHit,
): boolean {
  const row = getProjectGpuRetainedSliderControlRow(event);
  return Boolean(row && !row.state.disabled);
}

export function commitProjectGpuRetainedSliderControlClick(
  event: GpuRetainedContentInteractionEvent,
): boolean {
  const row = getProjectGpuRetainedSliderControlRow(event);
  if (!row || row.state.disabled) {
    return false;
  }
  commitProjectGpuRetainedSliderParamPointerValue({
    control: row.control,
    hitRect: event.hit.rect,
    paramInfoId: event.hit.ownerRowId,
    point: event.localPoint,
    sectionId: event.ownerSectionId,
  });
  return true;
}

export function handleProjectGpuRetainedSliderControlDragMove(
  event: GpuRetainedContentDragEvent,
  {
    retainedContentScene,
  }: {
    readonly retainedContentScene: ProjectGpuRetainedContentSceneApi;
  },
): boolean {
  return handleProjectGpuRetainedSliderControlDragValue(event, {
    options: { skipBackendUpdate: true },
    retainedContentScene,
  });
}

export function handleProjectGpuRetainedSliderControlDragEnd(
  event: GpuRetainedContentDragEvent,
  {
    retainedContentScene,
  }: {
    readonly retainedContentScene: ProjectGpuRetainedContentSceneApi;
  },
): boolean {
  return handleProjectGpuRetainedSliderControlDragValue(event, {
    retainedContentScene,
  });
}

function handleProjectGpuRetainedSliderControlDragValue(
  event: GpuRetainedContentDragEvent,
  {
    options,
    retainedContentScene,
  }: {
    readonly options?: { readonly skipBackendUpdate?: boolean } | undefined;
    readonly retainedContentScene: ProjectGpuRetainedContentSceneApi;
  },
): boolean {
  const row = getProjectGpuRetainedSliderControlRow(event.activeHit);
  if (!row || row.state.disabled) {
    return false;
  }
  commitProjectGpuRetainedSliderParamPointerValue({
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

function commitProjectGpuRetainedSliderParamPointerValue({
  control,
  hitRect,
  options,
  paramInfoId,
  point,
  sectionId,
}: {
  readonly control: Extract<
    GpuRetainedContentRow["control"],
    { kind: "slider" }
  >;
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
      `Missing GPU retained slider param ${paramInfoId} in section ${sectionId}.`,
    );
  }
  const nextValue = resolveGpuRetainedSliderValueFromPoint({
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

function getProjectGpuRetainedSliderControlRow(
  event: GpuRetainedContentInteractionHit,
):
  | (GpuRetainedContentRow & {
      readonly control: Extract<
        GpuRetainedContentRow["control"],
        { kind: "slider" }
      >;
    })
  | null {
  if (event.hit.kind !== "control") {
    return null;
  }
  const row = event.retainedScene.rows.find(
    (candidate) => candidate.id === event.hit.ownerRowId,
  );
  if (!row?.control || row.control.kind !== "slider") {
    return null;
  }
  return row as GpuRetainedContentRow & {
    readonly control: Extract<
      GpuRetainedContentRow["control"],
      { kind: "slider" }
    >;
  };
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
