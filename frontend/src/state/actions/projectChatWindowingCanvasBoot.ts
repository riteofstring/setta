import { zoomIdentity } from "d3-zoom";
import { useReactFlow } from "forks/xyflow/core/store";
import { useProjectState } from "state/definitions";
import { ChatWindowModeEnum, SectionTypeEnum } from "utils/generatedTypes";
import {
  resolveProjectChatCanvasBootPosition,
  resolveProjectChatCanvasBootSectionSize,
} from "./projectChatWindowingCanvasSurface";
import {
  moveProjectChatWindowToCanvasSectionInState,
  type MoveProjectChatWindowToCanvasSectionOptions,
} from "./projectChatWindowingSectionState";
import { dispatchProjectChatWindowingMutation } from "./projectChatWindowingWrites";
import {
  canMutateProjectChatWindowingLayout,
  getProjectChatWindowingStateFromStore,
} from "./projectChatWindowingWriteState";
import { createTopLevelSectionWithResult } from "./sections/createSections";

function moveBootedProjectChatWindowToCanvasSection(
  instanceId: string,
  options: MoveProjectChatWindowToCanvasSectionOptions,
): void {
  dispatchProjectChatWindowingMutation((currentWindowing) => ({
    nextProjectChatWindowing: moveProjectChatWindowToCanvasSectionInState(
      currentWindowing,
      instanceId,
      options,
    ),
  }));
}

export async function bootProjectChatWindowToCanvasSection(
  instanceId: string,
): Promise<string | null> {
  if (!canMutateProjectChatWindowingLayout()) {
    return null;
  }
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const currentInstance = currentWindowing.instancesById[instanceId];
  if (!currentInstance) {
    return null;
  }
  if (currentInstance.mode === ChatWindowModeEnum.git_graph_mode) {
    return null;
  }

  let sectionId = currentInstance.sectionIdOrNull;
  const canvasSectionSize = sectionId
    ? null
    : resolveProjectChatCanvasBootSectionSize(instanceId);
  if (!sectionId) {
    const [viewportX, viewportY, viewportZoom] =
      useReactFlow.getState().transform;
    const created = await createTopLevelSectionWithResult({
      implType: SectionTypeEnum.Chat,
      implOverrides: {
        type: SectionTypeEnum.Chat,
        ...(canvasSectionSize ? { size: canvasSectionSize } : {}),
      },
      position: resolveProjectChatCanvasBootPosition(instanceId),
      name: currentInstance.title?.trim() ? currentInstance.title.trim() : null,
    });
    if (!created) {
      return null;
    }
    const { d3Zoom, d3Selection } = useReactFlow.getState();
    if (d3Zoom && d3Selection) {
      d3Zoom.transform(
        d3Selection,
        zoomIdentity.translate(viewportX, viewportY).scale(viewportZoom),
      );
    }
    sectionId = created.sectionId;
  }

  const latestWindowing = getProjectChatWindowingStateFromStore(
    useProjectState.getState(),
  );
  const latestInstance = latestWindowing.instancesById[instanceId];
  if (!latestInstance) {
    return sectionId;
  }

  const moveOptions = {
    sectionId,
    mode: latestInstance.mode,
  };
  const next = moveProjectChatWindowToCanvasSectionInState(
    latestWindowing,
    instanceId,
    moveOptions,
  );
  if (next !== latestWindowing) {
    moveBootedProjectChatWindowToCanvasSection(instanceId, moveOptions);
  }
  return sectionId;
}
