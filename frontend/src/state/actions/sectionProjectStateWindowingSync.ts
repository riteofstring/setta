import { type ProjectStateSingleConfig } from "utils/generatedTypes";
import { recordAuthoritativeProjectChatWindowingState } from "./projectChatWindowingAuthoritative";
import { reconcileProjectChatWindowingEphemeralState } from "./projectChatWindowingEphemeral";

export function recordProjectStateWindowingAuthoritativeSnapshot(
  projectState: ProjectStateSingleConfig,
): void {
  recordAuthoritativeProjectChatWindowingState(
    projectState.projectConfig.id,
    projectState.projectChatWindowing,
  );
}

export function reconcileProjectStateWindowingEphemeral(
  projectState: ProjectStateSingleConfig,
): void {
  reconcileProjectChatWindowingEphemeralState(
    projectState.projectChatWindowing,
    projectState.projectConfig.id,
  );
}
