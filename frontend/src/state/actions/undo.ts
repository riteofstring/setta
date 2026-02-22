import { route_redo, route_undo } from "utils/generatedEndpoints";
import { undoLastProjectChatThreadStorageMutation } from "./projectChatThreads";
import { getCurrProjectConfigId } from "./sectionInfos";

export function undoProjectState() {
  const projectConfigId = getCurrProjectConfigId();
  const didUndoThreadMutation =
    undoLastProjectChatThreadStorageMutation(projectConfigId);
  if (didUndoThreadMutation) {
    return;
  }
  route_undo({
    steps: 1,
    projectConfigId,
  });
}

export function redoProjectState() {
  route_redo({
    steps: 1,
    projectConfigId: getCurrProjectConfigId(),
  });
}
