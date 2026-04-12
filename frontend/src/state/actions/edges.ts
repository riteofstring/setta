import type { Connection } from "forks/xyflow/core/types";
import {
  createEdge,
  deleteEdges,
  reconnectEdge,
  setEdges,
  updateEdge,
} from "openapi/http";
import { callOpenAPI } from "openapi/http/result";
import { makeEdgeHandleKey } from "state/actions/edgeHandles";
import {
  useEdgeHandleRegistry,
  useProjectState,
  useShareSession,
} from "state/definitions";
import { AGENTIC_EDGE_HANDLE_IDS } from "./agenticEdges";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
} from "./sectionInfos";
import { STATE_MACHINE_EDGE_HANDLE_IDS } from "./stateMachineEdges";
const nonDataHandleIds = new Set<string>([
  AGENTIC_EDGE_HANDLE_IDS.source,
  AGENTIC_EDGE_HANDLE_IDS.target,
  STATE_MACHINE_EDGE_HANDLE_IDS.source,
  STATE_MACHINE_EDGE_HANDLE_IDS.target,
]);
export function isValidDataEdgeConnection(connection: Connection): boolean {
  if (!connection.sourceHandle || !connection.targetHandle) {
    return false;
  }
  if (nonDataHandleIds.has(connection.sourceHandle)) {
    return false;
  }
  if (nonDataHandleIds.has(connection.targetHandle)) {
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
        return callOpenAPI(
          updateEdge({
            body: {
              projectConfigId: getCurrProjectConfigId(),
              edge,
              frontendOpId,
            },
          } as Parameters<typeof updateEdge>[0]),
        );
      }
      return callOpenAPI(
        setEdges({
          body: {
            projectConfigId: getCurrProjectConfigId(),
            edges: useProjectState.getState().projectConfig.edges,
            frontendOpId,
          },
        } as Parameters<typeof setEdges>[0]),
      );
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
      callOpenAPI(
        deleteEdges({
          body: {
            projectConfigId: getCurrProjectConfigId(),
            edgeIds: selectedIds,
            frontendOpId,
          },
        } as Parameters<typeof deleteEdges>[0]),
      ),
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
  void callOpenAPI(
    createEdge({
      body: {
        projectConfigId: getCurrProjectConfigId(),
        sourceSectionId: connection.source,
        sourceVariantId,
        sourcePortId: connection.sourceHandle,
        targetSectionId: connection.target,
        targetVariantId,
        targetPortId: connection.targetHandle,
        type: "default",
      },
    } as Parameters<typeof createEdge>[0]),
  );
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
  void callOpenAPI(
    reconnectEdge({
      body: {
        projectConfigId: getCurrProjectConfigId(),
        edgeId,
        sourceSectionId: connection.source,
        sourceVariantId,
        sourcePortId: connection.sourceHandle,
        targetSectionId: connection.target,
        targetVariantId,
        targetPortId: connection.targetHandle,
      },
    } as Parameters<typeof reconnectEdge>[0]),
  );
}
