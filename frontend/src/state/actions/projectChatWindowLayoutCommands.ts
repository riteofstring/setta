import {
  ChatWindowPlacementEnum,
  type ChatWindowPlacement,
} from "utils/generatedTypes";
import {
  setProjectChatWindowBoundsByIdInState,
  setProjectChatWindowBoundsInState,
  setProjectChatWindowDockFractionsInState,
  type SetBoundsByInstanceIdOptions,
  type SetBoundsOptions,
  type SetDockFractionsOptions,
} from "./projectChatWindowingBoundsState";
import { setProjectChatWindowPlacementInState } from "./projectChatWindowingPlacementState";
import { clearTrackedGitPaneGraphWindowIfMatches } from "./projectChatWindowingTrackedGitPaneState";
import { dispatchProjectChatWindowingMutation } from "./projectChatWindowingWrites";
import { canMutateProjectChatWindowingLayout } from "./projectChatWindowingWriteState";
import { getCurrProjectConfigId } from "./sectionInfos";

export type {
  SetBoundsByInstanceIdOptions,
  SetBoundsOptions,
  SetDockFractionsOptions,
};

export function setProjectChatWindowPlacement(
  instanceId: string,
  placement: ChatWindowPlacement,
): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  const projectConfigId = getCurrProjectConfigId();
  if (placement !== ChatWindowPlacementEnum.maximized) {
    clearTrackedGitPaneGraphWindowIfMatches(projectConfigId, instanceId);
  }
  dispatchProjectChatWindowingMutation((currentWindowing) => ({
    nextProjectChatWindowing: setProjectChatWindowPlacementInState(
      currentWindowing,
      instanceId,
      placement,
    ),
  }));
}

export function setProjectChatWindowDockFractions(
  options: SetDockFractionsOptions,
): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  dispatchProjectChatWindowingMutation((currentWindowing) => ({
    nextProjectChatWindowing: setProjectChatWindowDockFractionsInState(
      currentWindowing,
      options,
    ),
  }));
}

export function setProjectChatWindowBounds(
  instanceId: string,
  bounds: SetBoundsOptions,
): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  clearTrackedGitPaneGraphWindowIfMatches(getCurrProjectConfigId(), instanceId);
  dispatchProjectChatWindowingMutation((currentWindowing) => ({
    nextProjectChatWindowing: setProjectChatWindowBoundsInState(
      currentWindowing,
      instanceId,
      bounds,
    ),
  }));
}

export function setProjectChatWindowBoundsById(
  boundsByInstanceId: SetBoundsByInstanceIdOptions,
): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  const projectConfigId = getCurrProjectConfigId();
  for (const instanceId of Object.keys(boundsByInstanceId)) {
    clearTrackedGitPaneGraphWindowIfMatches(projectConfigId, instanceId);
  }
  dispatchProjectChatWindowingMutation((currentWindowing) => ({
    nextProjectChatWindowing: setProjectChatWindowBoundsByIdInState(
      currentWindowing,
      boundsByInstanceId,
    ),
  }));
}
