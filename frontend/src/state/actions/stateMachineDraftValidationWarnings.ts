import type { ProjectStateSingleConfig } from "utils/generatedTypes";
import {
  getSectionDisplayName,
  type StateMachineEdge,
} from "./stateMachineDraftValidationGraph";

export type StateMachineDraftWarning = {
  detail: string;
  endCount: number;
  issueCount: number;
  startCount: number;
};

export function buildMissingMachineGroupDraftWarning(): StateMachineDraftWarning {
  return {
    detail: "Set a machine group ID so this gate can belong to a workflow.",
    startCount: 0,
    endCount: 0,
    issueCount: 1,
  };
}

export function buildIncompleteDraftWarning({
  machineGroupId,
  startCount,
  endCount,
}: {
  machineGroupId: string;
  startCount: number;
  endCount: number;
}): StateMachineDraftWarning {
  return {
    detail:
      `Workflow draft incomplete for machine group ${machineGroupId}. ` +
      `It currently has ${startCount} Start sections and ${endCount} End sections. ` +
      "It needs exactly 1 Start and at least 1 End.",
    startCount,
    endCount,
    issueCount: 1,
  };
}

export function buildUnreachableEndDraftWarning({
  state,
  machineGroupId,
  machineEdges,
  startSectionId,
  reachableChatSectionIds,
  dispatchableChatSectionIds,
  startCount,
  endCount,
}: {
  state: ProjectStateSingleConfig;
  machineGroupId: string;
  machineEdges: StateMachineEdge[];
  startSectionId: string;
  reachableChatSectionIds: Set<string>;
  dispatchableChatSectionIds: Set<string>;
  startCount: number;
  endCount: number;
}): StateMachineDraftWarning {
  const startOutgoingEdges = machineEdges.filter(
    (edge) => edge.sourceSectionId === startSectionId,
  );
  if (startOutgoingEdges.length === 0) {
    return {
      detail:
        `Workflow machine group ${machineGroupId} cannot reach an End section. ` +
        "Its Start section has no outgoing workflow edges.",
      startCount,
      endCount,
      issueCount: 1,
    };
  }

  const stalledChatLabels = [...reachableChatSectionIds]
    .filter((sectionId) => {
      if (dispatchableChatSectionIds.has(sectionId)) {
        return false;
      }
      return machineEdges.some((edge) => edge.sourceSectionId === sectionId);
    })
    .map((sectionId) => getSectionDisplayName(state, sectionId));
  if (stalledChatLabels.length === 1) {
    return {
      detail:
        `Workflow machine group ${machineGroupId} cannot reach an End section. ` +
        `${stalledChatLabels[0]} can be reached, but no reachable Send Prompt action starts a workflow child run for it, ` +
        "so its run-completed, run-failed, and signal outputs can never activate.",
      startCount,
      endCount,
      issueCount: 1,
    };
  }
  if (stalledChatLabels.length > 1) {
    return {
      detail:
        `Workflow machine group ${machineGroupId} cannot reach an End section. ` +
        `${stalledChatLabels.length} reachable chat sections never receive a reachable Send Prompt action, ` +
        "so their run-completed, run-failed, and signal outputs can never activate.",
      startCount,
      endCount,
      issueCount: 1,
    };
  }

  return {
    detail:
      `Workflow machine group ${machineGroupId} cannot reach an End section ` +
      "from its Start section with the current workflow edges.",
    startCount,
    endCount,
    issueCount: 1,
  };
}
