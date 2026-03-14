import type { Connection } from "forks/xyflow/core/types";
import { makeEdgeHandleKey } from "state/actions/edgeHandles";
import { useProjectState, useShareSession } from "state/definitions";
import { useEdgeHandleRegistry } from "state/stores/authoringStores";
import {
  route_create_edge,
  route_delete_edges,
  route_reconnect_edge,
  route_set_edges,
  route_update_edge,
} from "utils/generatedEndpoints";
import { AGENTIC_EDGE_HANDLE_IDS } from "./agenticEdges";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
} from "./sectionInfos";

const agenticHandleIds = new Set<string>([
  AGENTIC_EDGE_HANDLE_IDS.source,
  AGENTIC_EDGE_HANDLE_IDS.target,
]);

export function isValidDataEdgeConnection(connection: Connection): boolean {
  if (!connection.sourceHandle || !connection.targetHandle) {
    return false;
  }
  if (agenticHandleIds.has(connection.sourceHandle)) {
    return false;
  }
  if (agenticHandleIds.has(connection.targetHandle)) {
    return false;
  }
  return true;
}

export function toggleEdgeSelection(edgeId: string, multiSelect: boolean) {
  dispatchOptimisticProjectStateUpdate({
    apply: (state) => {
      const edges = state.projectConfig.edges;
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
          .projectConfig.edges.find((candidate) => candidate.id === edgeId);
        if (!edge) {
          return;
        }
        return route_update_edge({
          projectConfigId: getCurrProjectConfigId(),
          edge,
          frontendOpId,
        });
      }
      return route_set_edges({
        projectConfigId: getCurrProjectConfigId(),
        edges: useProjectState.getState().projectConfig.edges,
        frontendOpId,
      });
    },
  });
}

export function deleteSelectedEdges() {
  if (useShareSession.getState().isDeploymentMode) {
    return false;
  }
  const state = useProjectState.getState();
  const selectedIds = state.projectConfig.edges
    .filter((edge) => edge.selected)
    .map((edge) => edge.id);

  if (selectedIds.length === 0) {
    return false;
  }

  dispatchOptimisticProjectStateUpdate({
    apply: (draft) => {
      draft.projectConfig.edges = draft.projectConfig.edges.filter(
        (edge) => !selectedIds.includes(edge.id),
      );
    },
    send: (frontendOpId) =>
      route_delete_edges({
        projectConfigId: getCurrProjectConfigId(),
        edgeIds: selectedIds,
        frontendOpId,
      }),
  });

  return true;
}

export function createEdgeFromConnection(connection: Connection) {
  if (
    !connection.source ||
    !connection.target ||
    !connection.sourceHandle ||
    !connection.targetHandle
  ) {
    return;
  }

  const isDeploymentMode = useShareSession.getState().isDeploymentMode;
  if (isDeploymentMode) {
    return;
  }

  const state = useProjectState.getState();
  const sourceVariantId =
    state.projectConfig.sectionVariantMap[connection.source];
  const targetVariantId =
    state.projectConfig.sectionVariantMap[connection.target];
  if (!sourceVariantId || !targetVariantId) {
    return;
  }

  const registryPositions = useEdgeHandleRegistry.getState().positions;
  const sourceKey = makeEdgeHandleKey(
    connection.source,
    connection.sourceHandle,
    "source",
  );
  const targetKey = makeEdgeHandleKey(
    connection.target,
    connection.targetHandle,
    "target",
  );
  if (!registryPositions[sourceKey] || !registryPositions[targetKey]) {
    return;
  }

  void route_create_edge({
    projectConfigId: getCurrProjectConfigId(),
    sourceSectionId: connection.source,
    sourceVariantId,
    sourcePortId: connection.sourceHandle,
    targetSectionId: connection.target,
    targetVariantId,
    targetPortId: connection.targetHandle,
    type: "default",
  });
}

export function reconnectEdgeFromConnection(
  edgeId: string,
  connection: Connection,
) {
  if (
    !connection.source ||
    !connection.target ||
    !connection.sourceHandle ||
    !connection.targetHandle
  ) {
    return;
  }

  const isDeploymentMode = useShareSession.getState().isDeploymentMode;
  if (isDeploymentMode) {
    return;
  }

  const state = useProjectState.getState();
  const sourceVariantId =
    state.projectConfig.sectionVariantMap[connection.source];
  const targetVariantId =
    state.projectConfig.sectionVariantMap[connection.target];
  if (!sourceVariantId || !targetVariantId) {
    return;
  }

  const registryPositions = useEdgeHandleRegistry.getState().positions;
  const sourceKey = makeEdgeHandleKey(
    connection.source,
    connection.sourceHandle,
    "source",
  );
  const targetKey = makeEdgeHandleKey(
    connection.target,
    connection.targetHandle,
    "target",
  );
  if (!registryPositions[sourceKey] || !registryPositions[targetKey]) {
    return;
  }

  void route_reconnect_edge({
    projectConfigId: getCurrProjectConfigId(),
    edgeId,
    sourceSectionId: connection.source,
    sourceVariantId,
    sourcePortId: connection.sourceHandle,
    targetSectionId: connection.target,
    targetVariantId,
    targetPortId: connection.targetHandle,
  });
}
