import {
  SectionTypeEnum,
  type ProjectStateSingleConfig,
} from "utils/generatedTypes";
import {
  getCurrEffectiveSectionImpl,
  getCurrEffectiveSectionImplIfPresent,
} from "./sectionEffectiveImplSelectors";

export type StateMachineEdge =
  ProjectStateSingleConfig["projectConfig"]["stateMachineEdges"][number];

export function collectMachineSections(
  state: ProjectStateSingleConfig,
  machineGroupId: string,
): {
  endSectionIds: string[];
  startSectionIds: string[];
} {
  const startSectionIds: string[] = [];
  const endSectionIds: string[] = [];

  for (const sectionId of Object.keys(state.projectConfig.sectionVariantMap)) {
    const impl = getCurrEffectiveSectionImpl(state, sectionId);
    if (
      impl.type !== SectionTypeEnum.StateMachineStart &&
      impl.type !== SectionTypeEnum.StateMachineGate &&
      impl.type !== SectionTypeEnum.StateMachineEnd
    ) {
      continue;
    }
    if (impl.machineGroupId !== machineGroupId) {
      continue;
    }
    if (impl.type === SectionTypeEnum.StateMachineStart) {
      startSectionIds.push(sectionId);
      continue;
    }
    if (impl.type === SectionTypeEnum.StateMachineEnd) {
      endSectionIds.push(sectionId);
    }
  }

  return {
    startSectionIds,
    endSectionIds,
  };
}

export function groupEdgesByTargetSection(
  edges: StateMachineEdge[],
): Map<string, StateMachineEdge[]> {
  const edgesByTargetSectionId = new Map<string, StateMachineEdge[]>();
  for (const edge of edges) {
    const existing = edgesByTargetSectionId.get(edge.targetSectionId);
    if (existing) {
      existing.push(edge);
      continue;
    }
    edgesByTargetSectionId.set(edge.targetSectionId, [edge]);
  }
  return edgesByTargetSectionId;
}

export function canSourceActivateEdge({
  state,
  edge,
  startSectionId,
  dispatchableChatSectionIds,
  possibleGateSectionIds,
}: {
  state: ProjectStateSingleConfig;
  edge: StateMachineEdge;
  startSectionId: string;
  dispatchableChatSectionIds: Set<string>;
  possibleGateSectionIds: Set<string>;
}): boolean {
  const sourceImpl = getCurrEffectiveSectionImplIfPresent(
    state,
    edge.sourceSectionId,
  );
  if (sourceImpl === null) {
    return false;
  }
  if (sourceImpl.type === SectionTypeEnum.StateMachineStart) {
    return edge.sourceSectionId === startSectionId;
  }
  if (sourceImpl.type === SectionTypeEnum.StateMachineGate) {
    return possibleGateSectionIds.has(edge.sourceSectionId);
  }
  if (sourceImpl.type === SectionTypeEnum.Chat) {
    return dispatchableChatSectionIds.has(edge.sourceSectionId);
  }
  return false;
}

export function getSectionDisplayName(
  state: ProjectStateSingleConfig,
  sectionId: string,
): string {
  const section = state.sections[sectionId];
  const impl = getCurrEffectiveSectionImplIfPresent(state, sectionId);
  const shortSectionId = sectionId.slice(0, 8);
  if (impl === null) {
    return `section ${shortSectionId}`;
  }
  const sectionTypeLabel = getSectionTypeLabel(impl.type);
  const displayName = section?.displayName?.trim();
  if (displayName) {
    return `${sectionTypeLabel} "${displayName}" (${shortSectionId})`;
  }
  const sectionName = section?.name?.trim();
  if (sectionName) {
    return `${sectionTypeLabel} "${sectionName}" (${shortSectionId})`;
  }
  if ("label" in impl && typeof impl.label === "string") {
    const label = impl.label.trim();
    if (label !== "") {
      return `${sectionTypeLabel} "${label}" (${shortSectionId})`;
    }
  }
  if (typeof impl.name === "string") {
    const name = impl.name.trim();
    if (name !== "") {
      return `${sectionTypeLabel} "${name}" (${shortSectionId})`;
    }
  }
  return `${sectionTypeLabel} ${shortSectionId}`;
}

function getSectionTypeLabel(type: string): string {
  if (type === SectionTypeEnum.Chat) {
    return "Chat section";
  }
  if (type === SectionTypeEnum.StateMachineStart) {
    return "Start section";
  }
  if (type === SectionTypeEnum.StateMachineGate) {
    return "Gate section";
  }
  if (type === SectionTypeEnum.StateMachineEnd) {
    return "End section";
  }
  return "Section";
}
