import { useProjectState } from "state/definitions";
import { route_set_project_chat_windowing_state } from "utils/generatedEndpoints";
import { type ProjectChatWindowingState } from "utils/generatedTypes";
import {
  getAuthoritativeProjectChatWindowingState,
  recordAuthoritativeProjectChatWindowingState,
} from "./projectChatWindowingAuthoritative";
import {
  applyProjectChatWindowingEphemeralState,
  applyProjectChatWindowingMutationToState,
  type ProjectChatWindowingMutation,
} from "./projectChatWindowingWriteState";

export type ProjectChatWindowingWriteResponse = Awaited<
  ReturnType<typeof route_set_project_chat_windowing_state>
>;

type SyntheticProjectChatWindowingWriteResponse = {
  data: ProjectChatWindowingState;
  hasResponse: true;
  status: 200;
};

export type ProjectChatWindowingTrackedResponse =
  | ProjectChatWindowingWriteResponse
  | SyntheticProjectChatWindowingWriteResponse;

export type ProjectChatWindowingSend = (
  projectConfigId: string,
  frontendOpId: string,
  nextProjectChatWindowing: ProjectChatWindowingState,
) => Promise<ProjectChatWindowingTrackedResponse>;

export function primeAuthoritativeProjectChatWindowingState(
  projectConfigId: string,
  hasPendingMutations: boolean,
  projectChatWindowing: ProjectChatWindowingState,
): void {
  if (hasPendingMutations) {
    return;
  }
  recordAuthoritativeProjectChatWindowingState(
    projectConfigId,
    projectChatWindowing,
  );
}

export function publishAuthoritativeProjectChatWindowingState(
  projectConfigId: string,
  authoritativeWindowing: ProjectChatWindowingState,
  replayMutations: Array<ProjectChatWindowingMutation>,
): void {
  recordAuthoritativeProjectChatWindowingState(
    projectConfigId,
    authoritativeWindowing,
  );
  if (useProjectState.getState().projectConfig.id !== projectConfigId) {
    return;
  }

  applyProjectChatWindowingEphemeralState(
    projectConfigId,
    authoritativeWindowing,
    {},
  );
  useProjectState.setState((state) => {
    if (state.projectConfig.id !== projectConfigId) {
      return;
    }
    state.projectChatWindowing = authoritativeWindowing;
    for (const mutation of replayMutations) {
      applyProjectChatWindowingMutationToState(
        state,
        projectConfigId,
        mutation,
      );
    }
  });
}

export function sendProjectChatWindowingSnapshot(
  projectConfigId: string,
  frontendOpId: string,
  nextProjectChatWindowing: ProjectChatWindowingState,
): Promise<ProjectChatWindowingWriteResponse> {
  return route_set_project_chat_windowing_state({
    projectConfigId,
    state: nextProjectChatWindowing,
    frontendOpId,
  });
}

export function buildSyntheticProjectChatWindowingWriteResponse(
  projectConfigId: string,
): SyntheticProjectChatWindowingWriteResponse {
  return {
    data:
      getAuthoritativeProjectChatWindowingState(projectConfigId) ??
      useProjectState.getState().projectChatWindowing,
    status: 200,
    hasResponse: true,
  };
}
