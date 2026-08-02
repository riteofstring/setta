import {
  SectionTypeEnum,
  StateMachineGateTypeEnum,
  type SingleConfig,
} from "utils/generatedTypes";
import {
  getCurrEffectiveSectionImpl,
  getCurrEffectiveSectionImplIfPresent,
} from "./sectionInfos";

type StateMachineDraftWarning = {
  detail: string;
  endCount: number;
  issueCount: number;
  startCount: number;
};

type StateMachineEdge =
  SingleConfig["projectConfig"]["stateMachineEdges"][number];
type StateSection = SingleConfig["sections"][string];
type ResolvedSectionImpl = Exclude<
  ReturnType<typeof getCurrEffectiveSectionImplIfPresent>,
  null
>;
type ReachabilityState = {
  activatableEdgeIds: Set<string>;
  dispatchableChatSectionIds: Set<string>;
  possibleGateSectionIds: Set<string>;
  reachableChatSectionIds: Set<string>;
};

export function getStateMachineDraftWarning(
  state: SingleConfig,
  machineGroupId: string,
): StateMachineDraftWarning | null {
  const normalizedMachineGroupId = machineGroupId.trim();
  if (normalizedMachineGroupId === "") {
    return {
      detail: "Set a machine group ID so this gate can belong to a workflow.",
      startCount: 0,
      endCount: 0,
      issueCount: 1,
    };
  }

  const machineSections = collectMachineSections(
    state,
    normalizedMachineGroupId,
  );
  const startCount = machineSections.startSectionIds.length;
  const endCount = machineSections.endSectionIds.length;

  if (startCount !== 1 || endCount < 1) {
    return {
      detail: buildDraftWarningDetail({
        machineGroupId: normalizedMachineGroupId,
        startCount,
        endCount,
      }),
      startCount,
      endCount,
      issueCount: 1,
    };
  }

  const unreachableEndWarning = getUnreachableEndWarning({
    state,
    machineGroupId: normalizedMachineGroupId,
    startSectionId: machineSections.startSectionIds[0],
    endSectionIds: new Set(machineSections.endSectionIds),
  });
  if (unreachableEndWarning === null) {
    return null;
  }

  return {
    detail: unreachableEndWarning,
    startCount,
    endCount,
    issueCount: 1,
  };
}

function buildDraftWarningDetail({
  machineGroupId,
  startCount,
  endCount,
}: {
  machineGroupId: string;
  startCount: number;
  endCount: number;
}): string {
  return (
    `Workflow draft incomplete for machine group ${machineGroupId}. ` +
    `It currently has ${startCount} Start sections and ${endCount} End sections. ` +
    "It needs exactly 1 Start and at least 1 End."
  );
}

function collectMachineSections(
  state: SingleConfig,
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

function getUnreachableEndWarning({
  state,
  machineGroupId,
  startSectionId,
  endSectionIds,
}: {
  state: SingleConfig;
  machineGroupId: string;
  startSectionId: string;
  endSectionIds: Set<string>;
}): string | null {
  const machineEdges = state.projectConfig.stateMachineEdges.filter(
    (edge) => edge.machineGroupId === machineGroupId,
  );
  const reachability = getWorkflowReachabilityState({
    state,
    machineEdges,
    startSectionId,
  });
  if (
    hasReachableEndEdge(
      machineEdges,
      endSectionIds,
      reachability.activatableEdgeIds,
    )
  ) {
    return null;
  }

  return buildUnreachableEndDetail({
    state,
    machineGroupId,
    machineEdges,
    startSectionId,
    reachableChatSectionIds: reachability.reachableChatSectionIds,
    dispatchableChatSectionIds: reachability.dispatchableChatSectionIds,
  });
}

function getWorkflowReachabilityState({
  state,
  machineEdges,
  startSectionId,
}: {
  state: SingleConfig;
  machineEdges: StateMachineEdge[];
  startSectionId: string;
}): ReachabilityState {
  const reachability = createReachabilityState();
  const edgesByTargetSectionId = groupEdgesByTargetSection(machineEdges);
  let changed = true;

  while (changed) {
    changed = false;
    changed =
      activateReachableEdges({
        state,
        machineEdges,
        startSectionId,
        reachability,
      }) || changed;
    changed =
      activateReachableGates({
        state,
        edgesByTargetSectionId,
        activatableEdgeIds: reachability.activatableEdgeIds,
        possibleGateSectionIds: reachability.possibleGateSectionIds,
      }) || changed;
  }

  return reachability;
}

function createReachabilityState(): ReachabilityState {
  return {
    activatableEdgeIds: new Set<string>(),
    dispatchableChatSectionIds: new Set<string>(),
    possibleGateSectionIds: new Set<string>(),
    reachableChatSectionIds: new Set<string>(),
  };
}

function activateReachableEdges({
  state,
  machineEdges,
  startSectionId,
  reachability,
}: {
  state: SingleConfig;
  machineEdges: StateMachineEdge[];
  startSectionId: string;
  reachability: ReachabilityState;
}): boolean {
  let changed = false;

  for (const edge of machineEdges) {
    if (
      !canSourceActivateEdge({
        state,
        edge,
        startSectionId,
        dispatchableChatSectionIds: reachability.dispatchableChatSectionIds,
        possibleGateSectionIds: reachability.possibleGateSectionIds,
      })
    ) {
      continue;
    }
    changed = addToSet(reachability.activatableEdgeIds, edge.id) || changed;
    changed = markReachableChatTarget(state, edge, reachability) || changed;
  }

  return changed;
}

function markReachableChatTarget(
  state: SingleConfig,
  edge: StateMachineEdge,
  reachability: ReachabilityState,
): boolean {
  const targetImpl = getCurrEffectiveSectionImplIfPresent(
    state,
    edge.targetSectionId,
  );
  if (targetImpl?.type !== SectionTypeEnum.Chat) {
    return false;
  }

  let changed = addToSet(
    reachability.reachableChatSectionIds,
    edge.targetSectionId,
  );
  if (edge.targetAction?.type === "send_prompt") {
    changed =
      addToSet(reachability.dispatchableChatSectionIds, edge.targetSectionId) ||
      changed;
  }
  return changed;
}

function activateReachableGates({
  state,
  edgesByTargetSectionId,
  activatableEdgeIds,
  possibleGateSectionIds,
}: {
  state: SingleConfig;
  edgesByTargetSectionId: Map<string, StateMachineEdge[]>;
  activatableEdgeIds: Set<string>;
  possibleGateSectionIds: Set<string>;
}): boolean {
  let changed = false;

  for (const [gateSectionId, incomingEdges] of edgesByTargetSectionId) {
    const gateImpl = getCurrEffectiveSectionImplIfPresent(state, gateSectionId);
    if (gateImpl?.type !== SectionTypeEnum.StateMachineGate) {
      continue;
    }
    if (possibleGateSectionIds.has(gateSectionId)) {
      continue;
    }
    if (
      !isGatePotentiallySatisfied(
        gateImpl.gateType ?? StateMachineGateTypeEnum.AND,
        incomingEdges,
        activatableEdgeIds,
      )
    ) {
      continue;
    }
    possibleGateSectionIds.add(gateSectionId);
    changed = true;
  }

  return changed;
}

function hasReachableEndEdge(
  machineEdges: StateMachineEdge[],
  endSectionIds: Set<string>,
  activatableEdgeIds: Set<string>,
): boolean {
  return machineEdges.some(
    (edge) =>
      endSectionIds.has(edge.targetSectionId) &&
      activatableEdgeIds.has(edge.id),
  );
}

function groupEdgesByTargetSection(
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

function canSourceActivateEdge({
  state,
  edge,
  startSectionId,
  dispatchableChatSectionIds,
  possibleGateSectionIds,
}: {
  state: SingleConfig;
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

function buildUnreachableEndDetail({
  state,
  machineGroupId,
  machineEdges,
  startSectionId,
  reachableChatSectionIds,
  dispatchableChatSectionIds,
}: {
  state: SingleConfig;
  machineGroupId: string;
  machineEdges: StateMachineEdge[];
  startSectionId: string;
  reachableChatSectionIds: Set<string>;
  dispatchableChatSectionIds: Set<string>;
}): string {
  const startOutgoingEdges = machineEdges.filter(
    (edge) => edge.sourceSectionId === startSectionId,
  );
  if (startOutgoingEdges.length === 0) {
    return (
      `Workflow machine group ${machineGroupId} cannot reach an End section. ` +
      "Its Start section has no outgoing workflow edges."
    );
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
    return (
      `Workflow machine group ${machineGroupId} cannot reach an End section. ` +
      `${stalledChatLabels[0]} can be reached, but no reachable Send Prompt action starts a workflow child run for it, ` +
      "so its run-completed, run-failed, and signal outputs can never activate."
    );
  }
  if (stalledChatLabels.length > 1) {
    return (
      `Workflow machine group ${machineGroupId} cannot reach an End section. ` +
      `${stalledChatLabels.length} reachable chat sections never receive a reachable Send Prompt action, ` +
      "so their run-completed, run-failed, and signal outputs can never activate."
    );
  }

  return (
    `Workflow machine group ${machineGroupId} cannot reach an End section ` +
    "from its Start section with the current workflow edges."
  );
}

function getSectionDisplayName(state: SingleConfig, sectionId: string): string {
  const section = state.sections[sectionId];
  const impl = getCurrEffectiveSectionImplIfPresent(state, sectionId);
  const shortSectionId = sectionId.slice(0, 8);
  if (impl === null) {
    return `section ${shortSectionId}`;
  }
  return formatSectionDisplayName(
    getSectionTypeLabel(impl.type),
    getPreferredSectionName(section, impl),
    shortSectionId,
  );
}

function getPreferredSectionName(
  section: StateSection | undefined,
  impl: ResolvedSectionImpl,
): string | null {
  const preferredName = [
    section?.displayName,
    section?.name,
    "label" in impl ? impl.label : null,
    impl.name,
  ]
    .map((value) => getTrimmedText(value))
    .find((value) => value !== null);
  return preferredName ?? null;
}

function getTrimmedText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmedValue = value.trim();
  return trimmedValue === "" ? null : trimmedValue;
}

function formatSectionDisplayName(
  sectionTypeLabel: string,
  preferredName: string | null,
  shortSectionId: string,
): string {
  if (preferredName === null) {
    return `${sectionTypeLabel} ${shortSectionId}`;
  }
  return `${sectionTypeLabel} "${preferredName}" (${shortSectionId})`;
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

function addToSet(values: Set<string>, value: string): boolean {
  if (values.has(value)) {
    return false;
  }
  values.add(value);
  return true;
}
