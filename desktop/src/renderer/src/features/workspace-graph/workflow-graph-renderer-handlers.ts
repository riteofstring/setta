import type {
  WorkflowGraphCameraState,
  WorkflowGraphEdgeConnection,
  WorkflowGraphRendererHandlers,
} from "./pixi-renderer";
import type { WorkflowLayoutPosition } from "./workflow-graph-layout";
import {
  writeWorkflowGraphCameraState,
  type SyntheticWorkflowGraphOptions,
  type WorkflowGraphCameraScope,
} from "./workflow-graph-camera-scope";
import type { WorkflowContextMenuState } from "./workflow-graph-surface-layers";

interface WorkflowRendererHandlersForSurfaceRequest {
  addWorkflowDraftEdge: (edge: WorkflowGraphEdgeConnection) => Promise<void>;
  deleteWorkflowDraftNodes: (nodeIds: string[]) => Promise<void>;
  handleGraphNodeSelectionChange: (nodeIds: string[]) => void;
  openGraphNodeDetails: (nodeId: string | null) => void;
  openWorkflowContextMenu: (menu: WorkflowContextMenuState) => void;
  persistNodePositions: (positions: WorkflowLayoutPosition[]) => Promise<void>;
  reactRenderCount: { current: number };
  surfaceId: string;
  syntheticGraph: SyntheticWorkflowGraphOptions;
  workflowCameraRef: { current: WorkflowGraphCameraState | null };
  workflowCameraScopeRef: { current: WorkflowGraphCameraScope | null };
}

export function workflowRendererHandlersForSurface({
  addWorkflowDraftEdge,
  deleteWorkflowDraftNodes,
  handleGraphNodeSelectionChange,
  openGraphNodeDetails,
  openWorkflowContextMenu,
  persistNodePositions,
  reactRenderCount,
  surfaceId,
  syntheticGraph,
  workflowCameraRef,
  workflowCameraScopeRef,
}: WorkflowRendererHandlersForSurfaceRequest): WorkflowGraphRendererHandlers {
  return {
    onCameraStateChange: (camera) => {
      workflowCameraRef.current = camera;
      writeWorkflowGraphCameraState(surfaceId, workflowCameraScopeRef.current, camera);
    },
    onCanvasContextMenu: syntheticGraph === null ? openWorkflowContextMenu : null,
    onEdgeCreate: syntheticGraph === null ? (edge) => void addWorkflowDraftEdge(edge) : undefined,
    onNodeDelete:
      syntheticGraph === null ? (nodeIds) => void deleteWorkflowDraftNodes(nodeIds) : undefined,
    onNodeOpen: syntheticGraph === null ? (nodeId) => openGraphNodeDetails(nodeId) : null,
    onNodePositionsChange: (positions) => {
      void persistNodePositions(positions);
    },
    onNodeSelectionChange: syntheticGraph === null ? handleGraphNodeSelectionChange : undefined,
    reactRenderCount: () => reactRenderCount.current,
  };
}
