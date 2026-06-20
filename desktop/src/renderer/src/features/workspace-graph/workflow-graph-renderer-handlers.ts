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
  deleteWorkflowDraftEdges: (edgeIds: string[]) => Promise<void>;
  deleteWorkflowDraftNodes: (nodeIds: string[]) => Promise<void>;
  handleGraphEdgeSelectionChange: (edgeIds: string[]) => void;
  handleGraphNodeSelectionChange: (nodeIds: string[]) => void;
  noteGraphSceneCameraMovement?: (() => void) | null;
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
  deleteWorkflowDraftEdges,
  deleteWorkflowDraftNodes,
  handleGraphEdgeSelectionChange,
  handleGraphNodeSelectionChange,
  noteGraphSceneCameraMovement,
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
      noteGraphSceneCameraMovement?.();
      workflowCameraRef.current = camera;
      writeWorkflowGraphCameraState(surfaceId, workflowCameraScopeRef.current, camera);
    },
    onCanvasContextMenu: syntheticGraph === null ? openWorkflowContextMenu : null,
    onEdgeCreate: syntheticGraph === null ? (edge) => void addWorkflowDraftEdge(edge) : undefined,
    onEdgeDelete:
      syntheticGraph === null ? (edgeIds) => void deleteWorkflowDraftEdges(edgeIds) : undefined,
    onEdgeSelectionChange: syntheticGraph === null ? handleGraphEdgeSelectionChange : undefined,
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
