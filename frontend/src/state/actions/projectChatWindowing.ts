import { useProjectState } from "state/definitions";
import { useSettings } from "state/stores/uiPreferenceStores";
import { route_set_project_chat_window_chat_id } from "utils/generatedEndpoints";
import {
  ChatWindowModeEnum,
  ChatWindowPlacementEnum,
  type ChatWindowMode,
  type ChatWindowPlacement,
} from "utils/generatedTypes";
import { clearTrackedGitPaneGraphWindowIfMatches } from "./projectChatWindowingEphemeral";
import {
  addProjectChatWindowInstanceInState,
  closeProjectChatWindowInState,
  focusProjectChatWindowInState,
  maximizeProjectChatWindowInState,
  minimizeProjectChatWindowInState,
  reopenProjectChatWindowInState,
  setProjectChatWindowBoundsByIdInState,
  setProjectChatWindowBoundsInState,
  setProjectChatWindowDockFractionsInState,
  setProjectChatWindowPlacementInState,
  unmaximizeProjectChatWindowInState,
  type CreateProjectChatWindowInstanceOptions,
  type SetBoundsByInstanceIdOptions,
  type SetBoundsOptions,
  type SetDockFractionsOptions,
} from "./projectChatWindowingLayoutState";
import {
  getProjectChatWindowInstanceForSectionInState,
  shouldSyncActiveProjectChatId,
} from "./projectChatWindowingSelectors";
import {
  setProjectChatWindowChatIdInState,
  setProjectChatWindowModeForSectionInState,
  setProjectChatWindowTitleInState,
  showSectionInProjectChatWindowInState,
  undockProjectChatWindowFromCanvasSectionInState,
} from "./projectChatWindowingState";
import {
  applyProjectChatWindowingMutationLocally,
  canMutateProjectChatWindowingLayout,
  dispatchProjectChatWindowingMutation,
  getProjectChatWindowingStateFromStore,
} from "./projectChatWindowingWrites";
import { getCurrProjectConfigId } from "./sectionInfos";

export {
  flushPendingProjectChatWindowingWrites,
  replaceProjectChatWindowingState,
  syncProjectChatWindowingState,
} from "./projectChatWindowingWrites";

export function createProjectChatWindowInstance(
  options: CreateProjectChatWindowInstanceOptions = {},
): string {
  if (!canMutateProjectChatWindowingLayout()) {
    return "";
  }
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const next = addProjectChatWindowInstanceInState(currentWindowing, options);
  dispatchProjectChatWindowingMutation((latestWindowing) => ({
    nextProjectChatWindowing: addProjectChatWindowInstanceInState(
      latestWindowing,
      {
        ...options,
        instanceId: next.instanceId,
      },
    ).state,
  }));
  return next.instanceId;
}

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

export function maximizeProjectChatWindow(instanceId: string): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  dispatchProjectChatWindowingMutation((currentWindowing) => ({
    nextProjectChatWindowing: maximizeProjectChatWindowInState(
      currentWindowing,
      instanceId,
    ),
  }));
}

export function unmaximizeProjectChatWindow(instanceId: string): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  clearTrackedGitPaneGraphWindowIfMatches(getCurrProjectConfigId(), instanceId);
  dispatchProjectChatWindowingMutation((currentWindowing) => ({
    nextProjectChatWindowing: unmaximizeProjectChatWindowInState(
      currentWindowing,
      instanceId,
      useSettings.getState().chatWindowing?.restorePriorStateOnUnmaximize ??
        true,
    ),
  }));
}

export function closeProjectChatWindow(instanceId: string): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  clearTrackedGitPaneGraphWindowIfMatches(getCurrProjectConfigId(), instanceId);
  dispatchProjectChatWindowingMutation((currentWindowing) => ({
    nextProjectChatWindowing: closeProjectChatWindowInState(
      currentWindowing,
      instanceId,
    ),
  }));
}

export function minimizeProjectChatWindow(instanceId: string): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  clearTrackedGitPaneGraphWindowIfMatches(getCurrProjectConfigId(), instanceId);
  dispatchProjectChatWindowingMutation((currentWindowing) => ({
    nextProjectChatWindowing: minimizeProjectChatWindowInState(
      currentWindowing,
      instanceId,
    ),
  }));
}

export function reopenProjectChatWindow(instanceId: string): void {
  const currentWindowing = getProjectChatWindowingStateFromStore(
    useProjectState.getState(),
  );
  const nextProjectChatWindowing = reopenProjectChatWindowInState(
    currentWindowing,
    instanceId,
  );
  if (nextProjectChatWindowing === currentWindowing) {
    return;
  }
  if (!canMutateProjectChatWindowingLayout()) {
    applyProjectChatWindowingMutationLocally(nextProjectChatWindowing);
    return;
  }
  dispatchProjectChatWindowingMutation((latestWindowing) => ({
    nextProjectChatWindowing: reopenProjectChatWindowInState(
      latestWindowing,
      instanceId,
    ),
  }));
}

export function focusProjectChatWindow(
  instanceId: string,
  nowMs: number = Date.now(),
): void {
  const state = useProjectState.getState();
  const currentWindowing = getProjectChatWindowingStateFromStore(state);
  const next = focusProjectChatWindowInState(
    currentWindowing,
    instanceId,
    nowMs,
  );
  if (next === currentWindowing) {
    return;
  }
  const focusedWindow = next.instancesById[instanceId];
  if (!canMutateProjectChatWindowingLayout()) {
    applyProjectChatWindowingMutationLocally(next, {
      ...(shouldSyncActiveProjectChatId(focusedWindow)
        ? {
            syncActiveChatId: focusedWindow.chatId ?? undefined,
          }
        : {}),
    });
    return;
  }
  dispatchProjectChatWindowingMutation((latestWindowing) => {
    const nextProjectChatWindowing = focusProjectChatWindowInState(
      latestWindowing,
      instanceId,
      nowMs,
    );
    const nextFocusedWindow =
      nextProjectChatWindowing.instancesById[instanceId] ?? null;
    return {
      nextProjectChatWindowing,
      options: shouldSyncActiveProjectChatId(nextFocusedWindow)
        ? {
            syncActiveChatId: nextFocusedWindow?.chatId ?? undefined,
          }
        : {},
    };
  });
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

export function setProjectChatWindowTitle(
  instanceId: string,
  title: string | null,
): void {
  if (!canMutateProjectChatWindowingLayout()) {
    return;
  }
  dispatchProjectChatWindowingMutation((currentWindowing) => ({
    nextProjectChatWindowing: setProjectChatWindowTitleInState(
      currentWindowing,
      instanceId,
      title,
    ),
  }));
}

export function setProjectChatWindowChatId(
  instanceId: string,
  chatId: string | null | undefined,
): void {
  const normalizedChatId = chatId?.trim() ? chatId.trim() : null;
  dispatchProjectChatWindowingMutation((currentWindowing) => {
    const nextProjectChatWindowing = setProjectChatWindowChatIdInState(
      currentWindowing,
      instanceId,
      normalizedChatId,
    );
    const updatedWindow =
      nextProjectChatWindowing.instancesById[instanceId] ?? null;
    return {
      nextProjectChatWindowing,
      send: (projectConfigId, frontendOpId) =>
        route_set_project_chat_window_chat_id({
          projectConfigId,
          instanceId,
          chatId: normalizedChatId,
          frontendOpId,
        }),
      options: shouldSyncActiveProjectChatId(updatedWindow)
        ? {
            syncActiveChatId: updatedWindow?.chatId ?? undefined,
          }
        : {},
    };
  });
}

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
