import type { Connection } from "forks/xyflow/core/types";
import {
  type ProjectStateSingleConfig,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { setCurrEffectiveSectionImplValue } from "./sectionEffectiveImplMutations";
import { getCurrEffectiveSectionImpl } from "./sectionEffectiveImpls";

export type WorkflowSectionInfo = {
  type: SectionTypeEnum | null;
  machineGroupId: string | null;
};

export type WorkflowMachineGroupTransition = {
  machineGroupId: string | null;
  mergedMachineGroupIds: string[];
};

export type WorkflowMachineGroupMergeSnapshot = {
  edgeMachineGroupById: Record<string, string>;
  sectionMachineGroupById: Record<string, string>;
};

export function getWorkflowSectionInfo(
  state: ProjectStateSingleConfig,
  sectionId: string,
): WorkflowSectionInfo {
  if (!(sectionId in state.projectConfig.sectionVariantMap)) {
    return { type: null, machineGroupId: null };
  }
  const impl = getCurrEffectiveSectionImpl(state, sectionId);
  if (
    impl.type === SectionTypeEnum.StateMachineStart ||
    impl.type === SectionTypeEnum.StateMachineGate ||
    impl.type === SectionTypeEnum.StateMachineEnd
  ) {
    return {
      type: impl.type,
      machineGroupId: impl.machineGroupId,
    };
  }
  return {
    type: impl.type ?? null,
    machineGroupId: null,
  };
}

function getUniqueConnectedMachineGroupId(
  state: ProjectStateSingleConfig,
  sectionId: string,
): string | null {
  const machineGroupIds = new Set<string>();
  for (const edge of state.projectConfig.stateMachineEdges) {
    if (
      edge.sourceSectionId === sectionId ||
      edge.targetSectionId === sectionId
    ) {
      machineGroupIds.add(edge.machineGroupId);
    }
  }
  if (machineGroupIds.size !== 1) {
    return null;
  }
  const [machineGroupId] = machineGroupIds;
  return machineGroupId ?? null;
}

function resolveExistingMachineGroupIdForConnectionEndpoint(
  state: ProjectStateSingleConfig,
  sectionId: string,
  sectionInfo: WorkflowSectionInfo,
): string | null {
  if (sectionInfo.machineGroupId) {
    return sectionInfo.machineGroupId;
  }
  return getUniqueConnectedMachineGroupId(state, sectionId);
}

export function resolveMachineGroupTransitionForConnection(
  connection: Connection,
  state: ProjectStateSingleConfig,
): WorkflowMachineGroupTransition {
  if (!connection.source || !connection.target) {
    return {
      machineGroupId: null,
      mergedMachineGroupIds: [],
    };
  }
  const sourceInfo = getWorkflowSectionInfo(state, connection.source);
  const targetInfo = getWorkflowSectionInfo(state, connection.target);
  const machineGroupIds = new Set<string>();
  const sourceMachineGroupId =
    resolveExistingMachineGroupIdForConnectionEndpoint(
      state,
      connection.source,
      sourceInfo,
    );
  const targetMachineGroupId =
    resolveExistingMachineGroupIdForConnectionEndpoint(
      state,
      connection.target,
      targetInfo,
    );
  if (sourceMachineGroupId) {
    machineGroupIds.add(sourceMachineGroupId);
  }
  if (targetMachineGroupId) {
    machineGroupIds.add(targetMachineGroupId);
  }
  if (machineGroupIds.size === 0) {
    return {
      machineGroupId: null,
      mergedMachineGroupIds: [],
    };
  }
  const machineGroupId = sourceMachineGroupId ?? targetMachineGroupId;
  if (!machineGroupId) {
    return {
      machineGroupId: null,
      mergedMachineGroupIds: [],
    };
  }
  return {
    machineGroupId,
    mergedMachineGroupIds: [...machineGroupIds].filter(
      (candidate) => candidate !== machineGroupId,
    ),
  };
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
      impl.type === SectionTypeEnum.StateMachineStart &&
      mergedMachineGroupIdSet.has(impl.machineGroupId)
    ) {
      setCurrEffectiveSectionImplValue<"StateMachineStartSection">(
        state,
        sectionId,
        { machineGroupId },
      );
      continue;
    }
    if (
      impl.type === SectionTypeEnum.StateMachineGate &&
      mergedMachineGroupIdSet.has(impl.machineGroupId)
    ) {
      setCurrEffectiveSectionImplValue<"StateMachineGateSection">(
        state,
        sectionId,
        { machineGroupId },
      );
      continue;
    }
    if (
      impl.type === SectionTypeEnum.StateMachineEnd &&
      mergedMachineGroupIdSet.has(impl.machineGroupId)
    ) {
      setCurrEffectiveSectionImplValue<"StateMachineEndSection">(
        state,
        sectionId,
        { machineGroupId },
      );
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
    const impl = getCurrEffectiveSectionImpl(state, sectionId);
    if (impl.type === SectionTypeEnum.StateMachineStart) {
      setCurrEffectiveSectionImplValue<"StateMachineStartSection">(
        state,
        sectionId,
        { machineGroupId },
      );
      continue;
    }
    if (impl.type === SectionTypeEnum.StateMachineGate) {
      setCurrEffectiveSectionImplValue<"StateMachineGateSection">(
        state,
        sectionId,
        { machineGroupId },
      );
      continue;
    }
    if (impl.type === SectionTypeEnum.StateMachineEnd) {
      setCurrEffectiveSectionImplValue<"StateMachineEndSection">(
        state,
        sectionId,
        { machineGroupId },
      );
    }
  }
  for (const edge of state.projectConfig.stateMachineEdges) {
    const machineGroupId = snapshot.edgeMachineGroupById[edge.id];
    if (machineGroupId) {
      edge.machineGroupId = machineGroupId;
    }
  }
}

export function isAllowedStateMachineConnection(
  sourceType: SectionTypeEnum | null,
  targetType: SectionTypeEnum | null,
  sourceSectionId: string,
  targetSectionId: string,
): boolean {
  if (!sourceType || !targetType) {
    return false;
  }
  const sourceAllowed = new Set<SectionTypeEnum>([
    SectionTypeEnum.Chat,
    SectionTypeEnum.StateMachineStart,
    SectionTypeEnum.StateMachineGate,
  ]);
  const targetAllowed = new Set<SectionTypeEnum>([
    SectionTypeEnum.Chat,
    SectionTypeEnum.StateMachineGate,
    SectionTypeEnum.StateMachineEnd,
  ]);
  if (!sourceAllowed.has(sourceType) || !targetAllowed.has(targetType)) {
    return false;
  }
  if (sourceType === SectionTypeEnum.StateMachineEnd) {
    return false;
  }
  if (targetType === SectionTypeEnum.StateMachineStart) {
    return false;
  }
  if (
    sourceSectionId === targetSectionId &&
    sourceType !== SectionTypeEnum.Chat
  ) {
    return false;
  }
  return true;
}
