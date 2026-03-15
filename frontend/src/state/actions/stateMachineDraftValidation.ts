import {
  SectionTypeEnum,
  StateMachineGateTypeEnum,
  type ProjectStateSingleConfig,
} from "utils/generatedTypes";
import { getCurrEffectiveSectionImplIfPresent } from "./sectionEffectiveImplSelectors";
import {
  canSourceActivateEdge,
  collectMachineSections,
  groupEdgesByTargetSection,
  type StateMachineEdge,
} from "./stateMachineDraftValidationGraph";
import {
  buildIncompleteDraftWarning,
  buildMissingMachineGroupDraftWarning,
  buildUnreachableEndDraftWarning,
  type StateMachineDraftWarning,
} from "./stateMachineDraftValidationWarnings";

export function getStateMachineDraftWarning(
  state: ProjectStateSingleConfig,
  machineGroupId: string,
): StateMachineDraftWarning | null {
  const normalizedMachineGroupId = machineGroupId.trim();
  if (normalizedMachineGroupId === "") {
    return buildMissingMachineGroupDraftWarning();
  }

  const machineSections = collectMachineSections(
    state,
    normalizedMachineGroupId,
  );
  const startCount = machineSections.startSectionIds.length;
  const endCount = machineSections.endSectionIds.length;

  if (startCount !== 1 || endCount < 1) {
    return buildIncompleteDraftWarning({
      machineGroupId: normalizedMachineGroupId,
      startCount,
      endCount,
    });
  }

  return getUnreachableEndWarning({
    state,
    machineGroupId: normalizedMachineGroupId,
    startSectionId: machineSections.startSectionIds[0],
    endSectionIds: new Set(machineSections.endSectionIds),
    startCount,
    endCount,
  });
}

function getUnreachableEndWarning({
  state,
  machineGroupId,
  startSectionId,
  endSectionIds,
  startCount,
  endCount,
}: {
  state: ProjectStateSingleConfig;
  machineGroupId: string;
  startSectionId: string;
  endSectionIds: Set<string>;
  startCount: number;
  endCount: number;
}): StateMachineDraftWarning | null {
  const machineEdges = state.projectConfig.stateMachineEdges.filter(
    (edge) => edge.machineGroupId === machineGroupId,
  );
  const edgesByTargetSectionId = groupEdgesByTargetSection(machineEdges);
  const activatableEdgeIds = new Set<string>();
  const dispatchableChatSectionIds = new Set<string>();
  const possibleGateSectionIds = new Set<string>();
  const reachableChatSectionIds = new Set<string>();
  let changed = true;

  while (changed) {
    changed = false;

    for (const edge of machineEdges) {
      if (
        !canSourceActivateEdge({
          state,
          edge,
          startSectionId,
          dispatchableChatSectionIds,
          possibleGateSectionIds,
        })
      ) {
        continue;
      }
      if (!activatableEdgeIds.has(edge.id)) {
        activatableEdgeIds.add(edge.id);
        changed = true;
      }

      const targetImpl = getCurrEffectiveSectionImplIfPresent(
        state,
        edge.targetSectionId,
      );
      if (targetImpl?.type === SectionTypeEnum.Chat) {
        if (!reachableChatSectionIds.has(edge.targetSectionId)) {
          reachableChatSectionIds.add(edge.targetSectionId);
          changed = true;
        }
        if (
          edge.targetAction?.type === "send_prompt" &&
          !dispatchableChatSectionIds.has(edge.targetSectionId)
        ) {
          dispatchableChatSectionIds.add(edge.targetSectionId);
          changed = true;
        }
      }
    }

    for (const [gateSectionId, incomingEdges] of edgesByTargetSectionId) {
      const gateImpl = getCurrEffectiveSectionImplIfPresent(
        state,
        gateSectionId,
      );
      if (gateImpl?.type !== SectionTypeEnum.StateMachineGate) {
        continue;
      }
      if (possibleGateSectionIds.has(gateSectionId)) {
        continue;
      }
      if (
        isGatePotentiallySatisfied(
          gateImpl.gateType ?? StateMachineGateTypeEnum.AND,
          incomingEdges,
          activatableEdgeIds,
        )
      ) {
        possibleGateSectionIds.add(gateSectionId);
        changed = true;
      }
    }
  }

  for (const edge of machineEdges) {
    if (!endSectionIds.has(edge.targetSectionId)) {
      continue;
    }
    if (activatableEdgeIds.has(edge.id)) {
      return null;
    }
  }

  return buildUnreachableEndDraftWarning({
    state,
    machineGroupId,
    machineEdges,
    startSectionId,
    reachableChatSectionIds,
    dispatchableChatSectionIds,
    startCount,
    endCount,
  });
}

function isGatePotentiallySatisfied(
  gateType: string,
  incomingEdges: StateMachineEdge[],
  activatableEdgeIds: Set<string>,
): boolean {
  if (incomingEdges.length === 0) {
    return false;
  }
  if (gateType === StateMachineGateTypeEnum.AND) {
    return incomingEdges.every((edge) => activatableEdgeIds.has(edge.id));
  }
  return incomingEdges.some((edge) => activatableEdgeIds.has(edge.id));
}
