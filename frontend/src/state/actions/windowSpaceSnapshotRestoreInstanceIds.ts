import type { ProjectChatWindowingState } from "utils/generatedTypes";

export function allocateFreshProjectChatWindowInstanceId(
  usedInstanceIds: Set<string>,
  nextInstanceNumber: number,
): {
  instanceId: string;
  nextInstanceNumber: number;
} {
  let candidateNumber = nextInstanceNumber;
  let candidateId = `project-chat-window-${candidateNumber}`;
  while (usedInstanceIds.has(candidateId)) {
    candidateNumber += 1;
    candidateId = `project-chat-window-${candidateNumber}`;
  }
  usedInstanceIds.add(candidateId);
  return {
    instanceId: candidateId,
    nextInstanceNumber: candidateNumber + 1,
  };
}

export function buildOrderedProjectChatWindowInstanceIds(
  state: ProjectChatWindowingState,
): Array<string> {
  const seen = new Set<string>();
  const orderedInstanceIds: Array<string> = [];
  for (const instanceId of state.order) {
    if (!state.instancesById[instanceId] || seen.has(instanceId)) {
      continue;
    }
    seen.add(instanceId);
    orderedInstanceIds.push(instanceId);
  }
  for (const instanceId of Object.keys(state.instancesById)) {
    if (seen.has(instanceId)) {
      continue;
    }
    seen.add(instanceId);
    orderedInstanceIds.push(instanceId);
  }
  return orderedInstanceIds;
}
