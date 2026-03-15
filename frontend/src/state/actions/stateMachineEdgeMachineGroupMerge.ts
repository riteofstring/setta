import type { ProjectStateSingleConfig } from "utils/generatedTypes";
import { SectionTypeEnum } from "utils/generatedTypes";
import { setCurrEffectiveSectionImplValue } from "./sectionEffectiveImplMutations";
import { getCurrEffectiveSectionImpl } from "./sectionEffectiveImplSelectors";

export type WorkflowMachineGroupMergeSnapshot = {
  edgeMachineGroupById: Record<string, string>;
  sectionMachineGroupById: Record<string, string>;
};

function setWorkflowSectionMachineGroupId(
  state: ProjectStateSingleConfig,
  sectionId: string,
  machineGroupId: string,
): void {
  const impl = getCurrEffectiveSectionImpl(state, sectionId);
  if (impl.type === SectionTypeEnum.StateMachineStart) {
    setCurrEffectiveSectionImplValue<"StateMachineStartSection">(
      state,
      sectionId,
      { machineGroupId },
    );
    return;
  }
  if (impl.type === SectionTypeEnum.StateMachineGate) {
    setCurrEffectiveSectionImplValue<"StateMachineGateSection">(
      state,
      sectionId,
      { machineGroupId },
    );
    return;
  }
  if (impl.type === SectionTypeEnum.StateMachineEnd) {
    setCurrEffectiveSectionImplValue<"StateMachineEndSection">(
      state,
      sectionId,
      { machineGroupId },
    );
  }
}

export function captureWorkflowMachineGroupMergeSnapshot(
  state: ProjectStateSingleConfig,
  mergedMachineGroupIds: string[],
): WorkflowMachineGroupMergeSnapshot {
  const mergedMachineGroupIdSet = new Set(mergedMachineGroupIds);
  const edgeMachineGroupById: Record<string, string> = {};
  for (const edge of state.projectConfig.stateMachineEdges) {
    if (mergedMachineGroupIdSet.has(edge.machineGroupId)) {
      edgeMachineGroupById[edge.id] = edge.machineGroupId;
    }
  }
  const sectionMachineGroupById: Record<string, string> = {};
  for (const sectionId of Object.keys(state.projectConfig.sectionVariantMap)) {
    const impl = getCurrEffectiveSectionImpl(state, sectionId);
    if (
      (impl.type === SectionTypeEnum.StateMachineStart ||
        impl.type === SectionTypeEnum.StateMachineGate ||
        impl.type === SectionTypeEnum.StateMachineEnd) &&
      mergedMachineGroupIdSet.has(impl.machineGroupId)
    ) {
      sectionMachineGroupById[sectionId] = impl.machineGroupId;
    }
  }
  return {
    edgeMachineGroupById,
    sectionMachineGroupById,
  };
}

export function applyWorkflowMachineGroupMerge(
  state: ProjectStateSingleConfig,
  machineGroupId: string,
  mergedMachineGroupIds: string[],
): void {
  if (mergedMachineGroupIds.length === 0) {
    return;
  }
  const mergedMachineGroupIdSet = new Set(mergedMachineGroupIds);
  for (const sectionId of Object.keys(state.projectConfig.sectionVariantMap)) {
    const impl = getCurrEffectiveSectionImpl(state, sectionId);
    if (
      (impl.type === SectionTypeEnum.StateMachineStart ||
        impl.type === SectionTypeEnum.StateMachineGate ||
        impl.type === SectionTypeEnum.StateMachineEnd) &&
      mergedMachineGroupIdSet.has(impl.machineGroupId)
    ) {
      setWorkflowSectionMachineGroupId(state, sectionId, machineGroupId);
    }
  }
  for (const edge of state.projectConfig.stateMachineEdges) {
    if (mergedMachineGroupIdSet.has(edge.machineGroupId)) {
      edge.machineGroupId = machineGroupId;
    }
  }
}

export function restoreWorkflowMachineGroupMergeSnapshot(
  state: ProjectStateSingleConfig,
  snapshot: WorkflowMachineGroupMergeSnapshot,
): void {
  for (const [sectionId, machineGroupId] of Object.entries(
    snapshot.sectionMachineGroupById,
  )) {
    setWorkflowSectionMachineGroupId(state, sectionId, machineGroupId);
  }
  for (const edge of state.projectConfig.stateMachineEdges) {
    const machineGroupId = snapshot.edgeMachineGroupById[edge.id];
    if (machineGroupId) {
      edge.machineGroupId = machineGroupId;
    }
  }
}
