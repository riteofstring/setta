import { useProjectState } from "state/definitions";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  type ChatWindowMode,
  type ChatWindowPlacement,
} from "utils/generatedTypes";
import { addProjectChatWindowInstanceInState } from "./projectChatWindowingInstanceCreation";
import {
  setProjectChatWindowModeForSectionInState,
  showSectionInProjectChatWindowInState,
  undockProjectChatWindowFromCanvasSectionInState,
} from "./projectChatWindowingSectionState";
import { getProjectChatWindowInstanceForSectionInState } from "./projectChatWindowingSelectors";
import { dispatchProjectChatWindowingMutation } from "./projectChatWindowingWrites";
import {
  canMutateProjectChatWindowingLayout,
  getProjectChatWindowingStateFromStore,
} from "./projectChatWindowingWriteState";

export function showSectionInProjectChatWindow(
  sectionId: string,
  placement: ChatWindowPlacement = ChatWindowPlacementEnum.floating,
): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const boundInstance = getProjectChatWindowInstanceForSectionInState(
    currentWindowing,
    sectionId,
  );
  const createdInstanceId =
    boundInstance?.instanceId ??
    addProjectChatWindowInstanceInState(currentWindowing, {
      placement,
      mode: ChatWindowModeEnum.section_mode,
      sectionIdOrNull: sectionId,
    }).instanceId;
  dispatchProjectChatWindowingMutation((latestWindowing) => ({
    nextProjectChatWindowing: showSectionInProjectChatWindowInState(
      latestWindowing,
      sectionId,
      {
        instanceId: createdInstanceId,
        placement,
      },
    ),
  }));
}

export function undockProjectChatWindowFromCanvasSection(
  instanceId: string,
): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const currentInstance = currentWindowing.instancesById[instanceId];
  if (
    !currentInstance ||
    currentInstance.placement !== ChatWindowPlacementEnum.canvas_section
  ) {
    return;
  }
  const next = undockProjectChatWindowFromCanvasSectionInState(
    currentWindowing,
    instanceId,
  );
  if (next === currentWindowing) {
    return;
  }
  dispatchProjectChatWindowingMutation((latestWindowing) => ({
    nextProjectChatWindowing: undockProjectChatWindowFromCanvasSectionInState(
      latestWindowing,
      instanceId,
    ),
  }));
}

export function setProjectChatWindowModeForSection(
  sectionId: string,
  mode: ChatWindowMode,
): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const boundInstance = getProjectChatWindowInstanceForSectionInState(
    currentWindowing,
    sectionId,
  );
  const createdInstanceId =
    boundInstance?.instanceId ??
    (mode === ChatWindowModeEnum.section_mode
      ? undefined
      : addProjectChatWindowInstanceInState(currentWindowing, {
          placement: ChatWindowPlacementEnum.canvas_section,
          mode,
          sectionIdOrNull: sectionId,
        }).instanceId);
  dispatchProjectChatWindowingMutation((latestWindowing) => ({
    nextProjectChatWindowing: setProjectChatWindowModeForSectionInState(
      latestWindowing,
      sectionId,
      mode,
      {
        createInstanceId: createdInstanceId,
      },
    ),
  }));
}
