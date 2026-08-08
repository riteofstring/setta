import { callOpenAPI, createNewId } from "@setta/app-subsystem-frontend-sdk";
import type { Connection } from "forks/xyflow/core/types";
import {
  createAgenticEdge,
  deleteAgenticEdges,
  setAgenticEdges,
  updateAgenticEdge,
} from "openapi/http";
import { useProjectState, useShareSession } from "state/definitions";
import {
  AgenticEdgeContextModeEnum,
  AgenticEdgeKindEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { isSharedChatHandleId } from "./chatSharedHandleIds";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
} from "./sectionInfos";
import { isWorkflowHandleId } from "./stateMachineEdges";
export const AGENTIC_EDGE_HANDLE_IDS = {
  source: "agentic-edge-source",
  target: "agentic-edge-target",
  reverseStart: "agentic-edge-reverse-start",
} as const;
type ConnectionSectionTypes = {
  sourceType: SectionTypeEnum | null;
  targetType: SectionTypeEnum | null;
};
const STATE_MACHINE_SECTION_TYPES = new Set<SectionTypeEnum>([
  SectionTypeEnum.StateMachineStart,
  SectionTypeEnum.StateMachineGate,
  SectionTypeEnum.StateMachineEnd,
]);

function getSectionTypeById(
  state: ReturnType<typeof useProjectState.getState>,
  sectionId: string,
): SectionTypeEnum | null {
  const variantId = state.projectConfig.sectionVariantMap[sectionId];
  if (!variantId) {
    return null;
  }
  const variant = state.sectionVariants[variantId];
  if (!variant) {
    return null;
  }
  const impl = state.sectionImpls[variant.impl];
  if (!impl) {
    return null;
  }
  return impl.type ?? null;
}
function isStateMachineSectionType(sectionType: SectionTypeEnum): boolean {
  return STATE_MACHINE_SECTION_TYPES.has(sectionType);
}

function isChatSectionType(sectionType: SectionTypeEnum): boolean {
  return sectionType === SectionTypeEnum.Chat;
}

function resolveAgenticEdgeKind(
  sourceType: SectionTypeEnum,
  targetType: SectionTypeEnum,
): AgenticEdgeKindEnum | null {
  if (
    isStateMachineSectionType(sourceType) ||
    isStateMachineSectionType(targetType)
  ) {
    return null;
  }
  const sourceIsChat = isChatSectionType(sourceType);
  const targetIsChat = isChatSectionType(targetType);
  if (sourceIsChat && targetIsChat) {
    return AgenticEdgeKindEnum.chat_chat;
  }
  if (sourceIsChat) {
    return AgenticEdgeKindEnum.chat_section;
  }
  if (targetIsChat) {
    return AgenticEdgeKindEnum.section_chat;
  }
  return null;
}
function resolveAgenticKindForConnection(
  connection: Connection,
  state?: ReturnType<typeof useProjectState.getState>,
): AgenticEdgeKindEnum | null {
  const types = getConnectionSectionTypes(connection, state);
  if (!types || !types.sourceType || !types.targetType) {
    return null;
  }
  return resolveAgenticEdgeKind(types.sourceType, types.targetType);
}
function normalizeReverseStartedAgenticConnection(
  connection: Connection,
): Connection {
  if (connection.sourceHandle !== AGENTIC_EDGE_HANDLE_IDS.reverseStart) {
    return connection;
  }
  return {
    source: connection.target,
    sourceHandle: connection.targetHandle,
    target: connection.source,
    targetHandle: AGENTIC_EDGE_HANDLE_IDS.target,
  };
}
export function normalizeAgenticConnectionHandles(
  connection: Connection,
): Connection {
  const normalizedReverseConnection =
    normalizeReverseStartedAgenticConnection(connection);
  return {
    ...normalizedReverseConnection,
    sourceHandle: isSharedChatHandleId(normalizedReverseConnection.sourceHandle)
      ? AGENTIC_EDGE_HANDLE_IDS.source
      : normalizedReverseConnection.sourceHandle,
    targetHandle:
      normalizedReverseConnection.targetHandle ===
      AGENTIC_EDGE_HANDLE_IDS.reverseStart
        ? AGENTIC_EDGE_HANDLE_IDS.target
        : isSharedChatHandleId(normalizedReverseConnection.targetHandle)
          ? AGENTIC_EDGE_HANDLE_IDS.target
          : normalizedReverseConnection.targetHandle,
  };
}
function usesSharedChatHandleOnNormalizedSource(
  connection: Connection,
  normalizedConnection: Connection,
): boolean {
  return (
    (isSharedChatHandleId(connection.sourceHandle) &&
      normalizedConnection.source === connection.source) ||
    (isSharedChatHandleId(connection.targetHandle) &&
      normalizedConnection.source === connection.target)
  );
}
function usesSharedChatHandleOnNormalizedTarget(
  connection: Connection,
  normalizedConnection: Connection,
): boolean {
  return (
    (isSharedChatHandleId(connection.sourceHandle) &&
      normalizedConnection.target === connection.source) ||
    (isSharedChatHandleId(connection.targetHandle) &&
      normalizedConnection.target === connection.target)
  );
}

function hasConnectionEndpoints(
  connection: Connection,
): connection is Connection & { source: string; target: string } {
  return Boolean(connection.source && connection.target);
}

function usesWorkflowHandle(connection: Connection): boolean {
  return (
    isWorkflowHandleId(connection.sourceHandle) ||
    isWorkflowHandleId(connection.targetHandle)
  );
}

function hasKnownConnectionSectionTypes(
  types: ConnectionSectionTypes | null,
): types is {
  sourceType: SectionTypeEnum;
  targetType: SectionTypeEnum;
} {
  return Boolean(types?.sourceType && types.targetType);
}

function usesInvalidSharedChatHandleTypes(
  connection: Connection,
  normalizedConnection: Connection,
  types: {
    sourceType: SectionTypeEnum;
    targetType: SectionTypeEnum;
  },
): boolean {
  const sourceUsesSharedChatHandle = usesSharedChatHandleOnNormalizedSource(
    connection,
    normalizedConnection,
  );
  if (sourceUsesSharedChatHandle && !isChatSectionType(types.sourceType)) {
    return true;
  }
  const targetUsesSharedChatHandle = usesSharedChatHandleOnNormalizedTarget(
    connection,
    normalizedConnection,
  );
  return targetUsesSharedChatHandle && !isChatSectionType(types.targetType);
}

function hasInvalidSharedChatHandleTypesForConnection(
  connection: Connection,
  normalizedConnection: Connection,
  state: ReturnType<
    typeof useProjectState.getState
  > = useProjectState.getState(),
): boolean {
  const types = getConnectionSectionTypes(normalizedConnection, state);
  if (!hasKnownConnectionSectionTypes(types)) {
    return false;
  }
  return usesInvalidSharedChatHandleTypes(
    connection,
    normalizedConnection,
    types,
  );
}

export function isValidAgenticEdgeConnection(connection: Connection): boolean {
  const normalizedConnection = normalizeAgenticConnectionHandles(connection);
  if (
    !hasConnectionEndpoints(normalizedConnection) ||
    usesWorkflowHandle(normalizedConnection) ||
    normalizedConnection.source === normalizedConnection.target ||
    useShareSession.getState().isDeploymentMode
  ) {
    return false;
  }
  const types = getConnectionSectionTypes(normalizedConnection);
  if (!hasKnownConnectionSectionTypes(types)) {
    return true;
  }
  if (
    usesInvalidSharedChatHandleTypes(connection, normalizedConnection, types)
  ) {
    return false;
  }
  return resolveAgenticEdgeKind(types.sourceType, types.targetType) !== null;
}
export function createAgenticEdgeFromConnection(connection: Connection): void {
  const normalizedConnection = normalizeAgenticConnectionHandles(connection);
  if (!normalizedConnection.source || !normalizedConnection.target) {
    return;
  }
  if (
    usesWorkflowHandle(normalizedConnection) ||
    hasInvalidSharedChatHandleTypesForConnection(
      connection,
      normalizedConnection,
    )
  ) {
    return;
  }
  const kind = resolveAgenticKindForConnection(normalizedConnection);
  if (!kind) {
    return;
  }
  createAgenticEdgeFromSections({
    sourceSectionId: normalizedConnection.source,
    targetSectionId: normalizedConnection.target,
    kind,
  });
}
function getConnectionSectionTypes(
  connection: Connection,
  state: ReturnType<
    typeof useProjectState.getState
  > = useProjectState.getState(),
): ConnectionSectionTypes | null {
  if (!hasConnectionEndpoints(connection)) {
    return null;
  }
  return getConnectionSectionTypesFromState(connection, state);
}
function getConnectionSectionTypesFromState(
  connection: Connection,
  state: ReturnType<typeof useProjectState.getState>,
): ConnectionSectionTypes | null {
  if (!hasConnectionEndpoints(connection)) {
    return null;
  }
  return {
    sourceType: getSectionTypeById(state, connection.source),
    targetType: getSectionTypeById(state, connection.target),
  };
}
export function toggleAgenticEdgeSelection(
  edgeId: string,
  multiSelect: boolean,
) {
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      const edges = state.projectConfig.agenticEdges;
      for (const edge of edges) {
        if (edge.id === edgeId) {
          edge.selected = multiSelect ? !edge.selected : true;
        } else if (!multiSelect) {
          edge.selected = false;
        }
      }
    },
    send: (frontendOpId) => {
      if (multiSelect) {
        const edge = useProjectState
          .getState()
          .projectConfig.agenticEdges.find(
            (candidate) => candidate.id === edgeId,
          );
        if (!edge) {
          return;
        }
        return callOpenAPI(
          updateAgenticEdge({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              edge,
              frontendOpId,
            },
          } as Parameters<typeof updateAgenticEdge>[0]),
        );
      }
      return callOpenAPI(
        setAgenticEdges({
          body: {
            projectConfigId: getCurrProjectConfigId(),
            edges: useProjectState.getState().projectConfig.agenticEdges,
            frontendOpId,
          },
        } as Parameters<typeof setAgenticEdges>[0]),
      );
    },
  });
}
export function deleteSelectedAgenticEdges(): boolean {
  if (useShareSession.getState().isDeploymentMode) {
    return false;
  }
  const state = useProjectState.getState();
  const selectedIds = state.projectConfig.agenticEdges
    .filter((edge) => edge.selected)
    .map((edge) => edge.id);
  if (selectedIds.length === 0) {
    return false;
  }
  dispatchOptimisticProjectStateUpdate({
    apply: (draft) => {
      draft.projectConfig.agenticEdges =
        draft.projectConfig.agenticEdges.filter(
          (edge) => !selectedIds.includes(edge.id),
        );
    },
    send: (frontendOpId) =>
      callOpenAPI(
        deleteAgenticEdges({
          body: {
            projectConfigId: getCurrProjectConfigId(),
            edgeIds: selectedIds,
            frontendOpId,
          },
        } as Parameters<typeof deleteAgenticEdges>[0]),
      ),
  });
  return true;
}
export function deleteAgenticEdgesById(edgeIds: string[]): void {
  if (useShareSession.getState().isDeploymentMode) {
    return;
  }
  if (edgeIds.length === 0) {
    return;
  }
  dispatchOptimisticProjectStateUpdate({
    apply: (draft) => {
      draft.projectConfig.agenticEdges =
        draft.projectConfig.agenticEdges.filter(
          (edge) => !edgeIds.includes(edge.id),
        );
    },
    send: (frontendOpId) =>
      callOpenAPI(
        deleteAgenticEdges({
          body: {
            projectConfigId: getCurrProjectConfigId(),
            edgeIds,
            frontendOpId,
          },
        } as Parameters<typeof deleteAgenticEdges>[0]),
      ),
  });
}
export function updateAgenticEdgeContextMode(
  edgeId: string,
  contextMode: AgenticEdgeContextModeEnum,
): void {
  if (useShareSession.getState().isDeploymentMode) {
    return;
  }
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      const edge = state.projectConfig.agenticEdges.find(
        (candidate) => candidate.id === edgeId,
      );
      if (!edge) {
        return;
      }
      edge.contextMode = contextMode;
    },
    send: (frontendOpId) => {
      const edge = useProjectState
        .getState()
        .projectConfig.agenticEdges.find(
          (candidate) => candidate.id === edgeId,
        );
      if (!edge) {
        return;
      }
      return callOpenAPI(
        updateAgenticEdge({
          body: {
            projectConfigId: getCurrProjectConfigId(),
            edge,
            frontendOpId,
          },
        } as Parameters<typeof updateAgenticEdge>[0]),
      );
    },
  });
}
export function createAgenticEdgeFromSections({
  sourceSectionId,
  targetSectionId,
  kind,
  contextMode = AgenticEdgeContextModeEnum.reference_only,
}: {
  sourceSectionId: string;
  targetSectionId: string;
  kind: AgenticEdgeKindEnum;
  contextMode?: AgenticEdgeContextModeEnum;
}): void {
  if (useShareSession.getState().isDeploymentMode) {
    return;
  }
  if (sourceSectionId === targetSectionId) {
    return;
  }
  const state = useProjectState.getState();
  const sourceType = getSectionTypeById(state, sourceSectionId);
  const targetType = getSectionTypeById(state, targetSectionId);
  if (!sourceType || !targetType) {
    return;
  }
  if (resolveAgenticEdgeKind(sourceType, targetType) !== kind) {
    return;
  }
  const existingEdges = useProjectState.getState().projectConfig.agenticEdges;
  const matchingEdge = existingEdges.find((edge) => {
    if (edge.kind !== kind) {
      return false;
    }
    if (kind === AgenticEdgeKindEnum.chat_chat) {
      return (
        (edge.sourceSectionId === sourceSectionId &&
          edge.targetSectionId === targetSectionId) ||
        (edge.sourceSectionId === targetSectionId &&
          edge.targetSectionId === sourceSectionId)
      );
    }
    return (
      edge.sourceSectionId === sourceSectionId &&
      edge.targetSectionId === targetSectionId
    );
  });
  if (matchingEdge) {
    return;
  }
  const edgeId = createNewId();
  const nextEdge = {
    id: edgeId,
    sourceSectionId,
    targetSectionId,
    kind,
    contextMode,
    style: null,
    hidden: false,
    zIndex: 0,
    selected: false,
  };
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      const edges = state.projectConfig.agenticEdges;
      if (edges.some((edge) => edge.id === edgeId)) {
        return;
      }
      edges.push(nextEdge);
    },
    rollback: (state) => {
      state.projectConfig.agenticEdges =
        state.projectConfig.agenticEdges.filter((edge) => edge.id !== edgeId);
    },
    send: (frontendOpId) =>
      callOpenAPI(
        createAgenticEdge({
          body: {
            projectConfigId: getCurrProjectConfigId(),
            id: edgeId,
            sourceSectionId,
            targetSectionId,
            kind,
            contextMode,
            style: null,
            hidden: false,
            zIndex: 0,
            frontendOpId,
          },
        } as Parameters<typeof createAgenticEdge>[0]),
      ),
  });
}
