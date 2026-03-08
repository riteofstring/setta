import type { Connection } from "forks/xyflow/core/types";
import { useProjectState, useShareSession } from "state/definitions";
import {
  route_create_agentic_edge,
  route_delete_agentic_edges,
  route_set_agentic_edges,
  route_update_agentic_edge,
} from "utils/generatedEndpoints";
import {
  AgenticEdgeContextModeEnum,
  AgenticEdgeKindEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";
import { isSharedChatHandleId } from "./chatSharedHandleIds";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
} from "./sectionInfos";
import { isWorkflowHandleId } from "./stateMachineEdges";

export const AGENTIC_EDGE_HANDLE_IDS = {
  source: "agentic-edge-source",
  target: "agentic-edge-target",
} as const;

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

function resolveAgenticEdgeKind(
  sourceType: SectionTypeEnum,
  targetType: SectionTypeEnum,
): AgenticEdgeKindEnum | null {
  if (
    sourceType === SectionTypeEnum.Chat &&
    targetType === SectionTypeEnum.Chat
  ) {
    return AgenticEdgeKindEnum.chat_chat;
  }
  if (sourceType === SectionTypeEnum.Chat) {
    return AgenticEdgeKindEnum.chat_section;
  }
  if (targetType === SectionTypeEnum.Chat) {
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

export function normalizeAgenticConnectionHandles(
  connection: Connection,
): Connection {
  return {
    ...connection,
    sourceHandle: isSharedChatHandleId(connection.sourceHandle)
      ? AGENTIC_EDGE_HANDLE_IDS.source
      : connection.sourceHandle,
    targetHandle: isSharedChatHandleId(connection.targetHandle)
      ? AGENTIC_EDGE_HANDLE_IDS.target
      : connection.targetHandle,
  };
}

export function isValidAgenticEdgeConnection(connection: Connection): boolean {
  const normalizedConnection = normalizeAgenticConnectionHandles(connection);
  if (!normalizedConnection.source || !normalizedConnection.target) {
    return false;
  }
  if (
    isWorkflowHandleId(normalizedConnection.sourceHandle) ||
    isWorkflowHandleId(normalizedConnection.targetHandle)
  ) {
    return false;
  }
  if (normalizedConnection.source === normalizedConnection.target) {
    return false;
  }
  if (useShareSession.getState().isDeploymentMode) {
    return false;
  }
  const types = getConnectionSectionTypes(normalizedConnection);
  if (!types || !types.sourceType || !types.targetType) {
    return true;
  }
  if (
    isSharedChatHandleId(connection.sourceHandle) &&
    types.sourceType !== SectionTypeEnum.Chat
  ) {
    return false;
  }
  if (
    isSharedChatHandleId(connection.targetHandle) &&
    types.targetType !== SectionTypeEnum.Chat
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
    isWorkflowHandleId(normalizedConnection.sourceHandle) ||
    isWorkflowHandleId(normalizedConnection.targetHandle)
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
): {
  sourceType: SectionTypeEnum | null;
  targetType: SectionTypeEnum | null;
} | null {
  if (!connection.source || !connection.target) {
    return null;
  }
  return getConnectionSectionTypesFromState(connection, state);
}

function getConnectionSectionTypesFromState(
  connection: Connection,
  state: ReturnType<typeof useProjectState.getState>,
): {
  sourceType: SectionTypeEnum | null;
  targetType: SectionTypeEnum | null;
} | null {
  if (!connection.source || !connection.target) {
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
        return route_update_agentic_edge({
          projectConfigId: getCurrProjectConfigId(),
          edge,
          frontendOpId,
        });
      }
      return route_set_agentic_edges({
        projectConfigId: getCurrProjectConfigId(),
        edges: useProjectState.getState().projectConfig.agenticEdges,
        frontendOpId,
      });
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
      route_delete_agentic_edges({
        projectConfigId: getCurrProjectConfigId(),
        edgeIds: selectedIds,
        frontendOpId,
      }),
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
      route_delete_agentic_edges({
        projectConfigId: getCurrProjectConfigId(),
        edgeIds,
        frontendOpId,
      }),
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
      return route_update_agentic_edge({
        projectConfigId: getCurrProjectConfigId(),
        edge,
        frontendOpId,
      });
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
      route_create_agentic_edge({
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
      }),
  });
}
