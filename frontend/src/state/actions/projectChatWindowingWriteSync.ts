import { NULL_PROJECT_CONFIG_ID, useProjectState } from "state/definitions";
import { createNewId } from "utils/idNameCreation";
import { enqueueSerializedProjectChatWindowingWrite } from "./projectChatWindowingWritePipeline";
import {
  primeAuthoritativeProjectChatWindowingState,
  sendProjectChatWindowingSnapshot,
  type ProjectChatWindowingSend,
} from "./projectChatWindowingWritePublish";
import {
  flushPendingProjectChatWindowingWrites,
  hasPendingProjectChatWindowingMutations,
} from "./projectChatWindowingWriteQueue";
import { getProjectChatWindowingStateFromStore } from "./projectChatWindowingWriteState";
import { getCurrProjectConfigId } from "./sectionInfos";

export { flushPendingProjectChatWindowingWrites };

export async function syncProjectChatWindowingState() {
  const projectConfigId = getCurrProjectConfigId();
  if (!projectConfigId || projectConfigId === NULL_PROJECT_CONFIG_ID) {
    return null;
  }
  const currentWindowing = getProjectChatWindowingStateFromStore(
    useProjectState.getState(),
  );
  primeAuthoritativeProjectChatWindowingState(
    projectConfigId,
    hasPendingProjectChatWindowingMutations(projectConfigId),
    currentWindowing,
  );
  const opId = createNewId();
  return enqueueSerializedProjectChatWindowingWrite(projectConfigId, opId, {
    alwaysSend: true,
    mutation: (latestWindowing) => ({
      nextProjectChatWindowing: latestWindowing,
      alwaysSend: true,
    }),
    opId,
    send: sendProjectChatWindowingSnapshot as ProjectChatWindowingSend,
  });
}
