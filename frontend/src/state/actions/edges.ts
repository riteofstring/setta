import { callOpenAPI } from "@setta/app-subsystem-frontend-sdk";
import type { Connection, GpuFlowConnectionContext } from "gpuFlow/flowTypes";
import {
  hasGpuFlowPortDescriptor,
  hasGpuFlowScenePortDescriptor,
} from "gpuFlow/ports/portGeometry";
import {
  createEdge,
  deleteEdges,
  reconnectEdge,
  setEdges,
  updateEdge,
} from "openapi/http";
import { useProjectState, useShareSession } from "state/definitions";
import { AGENTIC_EDGE_HANDLE_IDS } from "./agenticEdges";
import { SHARED_CHAT_EDGE_HANDLE_IDS } from "./chatSharedHandleIds";
import {
  dispatchOptimisticProjectStateUpdate,
  getCurrProjectConfigId,
} from "./sectionInfos";
import { STATE_MACHINE_EDGE_HANDLE_IDS } from "./stateMachineEdges";

type EdgeConnectionBody = Pick<
  NonNullable<Parameters<typeof createEdge>[0]["body"]>,
  | "projectConfigId"
  | "sourceSectionId"
  | "sourceVariantId"
  | "sourcePortId"
  | "targetSectionId"
  | "targetVariantId"
  | "targetPortId"
>;
type CompleteEdgeConnection = Connection & {
  source: string;
  target: string;
  sourceHandle: string;
  targetHandle: string;
};
type OpenAPIRequest = Parameters<typeof callOpenAPI>[0];

const nonDataHandleIds = new Set<string>([
  AGENTIC_EDGE_HANDLE_IDS.reverseStart,
  AGENTIC_EDGE_HANDLE_IDS.source,
  AGENTIC_EDGE_HANDLE_IDS.target,
  SHARED_CHAT_EDGE_HANDLE_IDS.reverseStart,
  SHARED_CHAT_EDGE_HANDLE_IDS.source,
  SHARED_CHAT_EDGE_HANDLE_IDS.target,
  STATE_MACHINE_EDGE_HANDLE_IDS.reverseStart,
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
      const edges = state.projectConfig.edges ?? [];
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
          .projectConfig.edges?.find((candidate) => candidate.id === edgeId);
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
          } as Parameters<typeof updateEdge>[0]) as OpenAPIRequest,
        );
      }
      return callOpenAPI(
        setEdges({
          body: {
            projectConfigId: getCurrProjectConfigId(),
            edges: useProjectState.getState().projectConfig.edges ?? [],
            frontendOpId,
          },
        } as Parameters<typeof setEdges>[0]) as OpenAPIRequest,
      );
    },
  });
}
export function deleteSelectedEdges() {
  if (useShareSession.getState().isDeploymentMode) {
    return false;
  }
  const state = useProjectState.getState();
  const selectedIds = (state.projectConfig.edges ?? [])
    .filter((edge) => edge.selected)
    .map((edge) => edge.id);
  if (selectedIds.length === 0) {
    return false;
  }
  dispatchOptimisticProjectStateUpdate({
    apply: (draft) => {
      draft.projectConfig.edges = (draft.projectConfig.edges ?? []).filter(
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
        } as Parameters<typeof deleteEdges>[0]) as OpenAPIRequest,
      ),
  });
  return true;
}

function resolveEdgeConnectionBody(
  connection: Connection,
  context?: GpuFlowConnectionContext,
): EdgeConnectionBody | null {
  if (!hasCompleteEdgeConnection(connection)) {
    return null;
  }
  if (useShareSession.getState().isDeploymentMode) {
    return null;
  }
  const state = useProjectState.getState();
  const variantIds = resolveEdgeConnectionVariantIds(connection, state);
  if (!variantIds) {
    return null;
  }
  if (!hasRegisteredEdgeConnection(connection, context)) {
    return null;
  }
  return {
    projectConfigId: getCurrProjectConfigId(),
    sourceSectionId: connection.source,
    sourceVariantId: variantIds.sourceVariantId,
    sourcePortId: connection.sourceHandle,
    targetSectionId: connection.target,
    targetVariantId: variantIds.targetVariantId,
    targetPortId: connection.targetHandle,
  };
}

function hasCompleteEdgeConnection(
  connection: Connection,
): connection is CompleteEdgeConnection {
  return Boolean(
    connection.source &&
      connection.target &&
      connection.sourceHandle &&
      connection.targetHandle,
  );
}

function resolveEdgeConnectionVariantIds(
  connection: CompleteEdgeConnection,
  state: ReturnType<typeof useProjectState.getState>,
): { sourceVariantId: string; targetVariantId: string } | null {
  const sourceVariantId =
    state.projectConfig.sectionVariantMap[connection.source];
  const targetVariantId =
    state.projectConfig.sectionVariantMap[connection.target];
  if (!sourceVariantId || !targetVariantId) {
    return null;
  }
  return { sourceVariantId, targetVariantId };
}

function hasRegisteredEdgeConnection(
  connection: CompleteEdgeConnection,
  context: GpuFlowConnectionContext | undefined,
): boolean {
  return (
    hasRegisteredOrSceneEdgeConnectionPort({
      context,
      nodeId: connection.source,
      portId: connection.sourceHandle,
      type: "source",
    }) &&
    hasRegisteredOrSceneEdgeConnectionPort({
      context,
      nodeId: connection.target,
      portId: connection.targetHandle,
      type: "target",
    })
  );
}

function hasRegisteredOrSceneEdgeConnectionPort({
  context,
  nodeId,
  portId,
  type,
}: {
  readonly context: GpuFlowConnectionContext | undefined;
  readonly nodeId: string;
  readonly portId: string;
  readonly type: "source" | "target";
}): boolean {
  return (
    hasGpuFlowPortDescriptor({
      nodeId,
      portId,
      type,
    }) ||
    hasGpuFlowScenePortDescriptor({
      nodeId,
      portId,
      scene: context?.scene,
      type,
    })
  );
}

export function createEdgeFromConnection(
  connection: Connection,
  context?: GpuFlowConnectionContext,
) {
  const body = resolveEdgeConnectionBody(connection, context);
  if (!body) {
    return;
  }
  void callOpenAPI(
    createEdge({
      body: { ...body, type: "default" },
    } as Parameters<typeof createEdge>[0]) as OpenAPIRequest,
  );
}
export function reconnectEdgeFromConnection(
  edgeId: string,
  connection: Connection,
  context?: GpuFlowConnectionContext,
) {
  const body = resolveEdgeConnectionBody(connection, context);
  if (!body) {
    return;
  }
  void callOpenAPI(
    reconnectEdge({
      body: { ...body, edgeId },
    } as Parameters<typeof reconnectEdge>[0]) as OpenAPIRequest,
  );
}
