import { res200 } from "utils/endpointUtils";
import {
  buildSyntheticProjectChatWindowingWriteResponse,
  publishAuthoritativeProjectChatWindowingState,
  type ProjectChatWindowingTrackedResponse,
} from "./projectChatWindowingWritePublish";
import {
  buildProjectChatWindowingSnapshotForMutation,
  createProjectChatWindowingWriteBarrier,
  dequeuePendingProjectChatWindowingMutation,
  findPendingProjectChatWindowingMutation,
  getPendingProjectChatWindowingReplayMutations,
  getProjectChatWindowingWriteBarrier,
  queuePendingProjectChatWindowingMutation,
  setProjectChatWindowingWriteBarrier,
  trackProjectChatWindowingWrite,
  type PendingProjectChatWindowingMutation,
} from "./projectChatWindowingWriteQueue";

export function enqueueSerializedProjectChatWindowingWrite(
  projectConfigId: string,
  opId: string,
  pendingMutation: PendingProjectChatWindowingMutation,
): Promise<ProjectChatWindowingTrackedResponse> {
  queuePendingProjectChatWindowingMutation(projectConfigId, pendingMutation);
  const previousBarrier =
    getProjectChatWindowingWriteBarrier(projectConfigId) ?? Promise.resolve();
  const request = previousBarrier.then(async () => {
    const targetMutation = findPendingProjectChatWindowingMutation(
      projectConfigId,
      opId,
    );
    const snapshot = buildProjectChatWindowingSnapshotForMutation(
      projectConfigId,
      opId,
    );
    if (!snapshot || !targetMutation) {
      return buildSyntheticProjectChatWindowingWriteResponse(projectConfigId);
    }
    const { authoritativeWindowing, nextProjectChatWindowing } = snapshot;
    if (
      !targetMutation.alwaysSend &&
      nextProjectChatWindowing === authoritativeWindowing
    ) {
      return buildSyntheticProjectChatWindowingWriteResponse(projectConfigId);
    }
    const response = await targetMutation.send(
      projectConfigId,
      opId,
      nextProjectChatWindowing,
    );
    if (res200(response)) {
      publishAuthoritativeProjectChatWindowingState(
        projectConfigId,
        response.data,
        getPendingProjectChatWindowingReplayMutations(projectConfigId, opId),
      );
    }
    return response;
  });
  const barrier = createProjectChatWindowingWriteBarrier(
    request.finally(() => {
      dequeuePendingProjectChatWindowingMutation(projectConfigId, opId);
    }),
  );
  setProjectChatWindowingWriteBarrier(projectConfigId, barrier);
  return trackProjectChatWindowingWrite(request);
}
