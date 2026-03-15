import type { Connection } from "forks/xyflow/core/types";
import { useProjectState, useShareSession } from "state/definitions";
import {
  route_create_agentic_edge,
  route_update_agentic_edge,
} from "utils/generatedEndpoints";
import {
  AgenticEdgeContextModeEnum,
  AgenticEdgeKindEnum,
} from "utils/generatedTypes";
import { createNewId } from "utils/idNameCreation";

import {
  normalizeAgenticConnectionHandles,
  resolveAgenticKindForConnection,
  resolveAgenticKindForSectionIds,
} from "./agenticEdgeConnections";
import { dispatchOptimisticProjectStateUpdate } from "./projectStateOptimisticUpdates";
import { getCurrProjectConfigId } from "./sectionInfos";
import { isWorkflowHandleId } from "./stateMachineEdgeCanonicalization";

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
  if (
    resolveAgenticKindForSectionIds(sourceSectionId, targetSectionId) !== kind
  ) {
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
