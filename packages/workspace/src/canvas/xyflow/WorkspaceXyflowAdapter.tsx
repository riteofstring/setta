import {
  ReactFlow,
  type NodeMouseHandler,
  type OnNodeDrag,
  type OnSelectionChangeFunc,
} from "@xyflow/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { applyActiveSectionChange } from "../activeSectionController";
import {
  useActiveSections,
  useNodeInternals,
  useWorkspaceDocument,
} from "../../document/stores";
import { useWorkspaceCapabilities } from "../../document/capabilities";
import {
  NO_DRAG_CLASS_NAME,
  NO_PAN_CLASS_NAME,
  NO_WHEEL_CLASS_NAME,
} from "../../interaction";
import { useWorkspaceHost } from "../../workspaceHostContext";
import { getWorkspaceHostDomId } from "../../workspaceHostInternals";
import { WorkspaceXyflowNode } from "./WorkspaceXyflowNode";
import { applyTransientWorkspaceXyflowNodeChanges } from "./workspaceXyflowChanges";
import { projectWorkspaceNodesToXyflow } from "./workspaceXyflowProjection";
import { registerWorkspaceXyflowInstance } from "./workspaceXyflowRuntime";
import type {
  WorkspaceXyflowNodeChange,
  WorkspaceXyflowSectionNode,
  WorkspaceXyflowViewport,
} from "./types";

type WorkspaceXyflowAdapterProps = {
  onDragCommit?: (nodes: ReadonlyArray<WorkspaceXyflowSectionNode>) => void;
  onViewportChange: (viewport: WorkspaceXyflowViewport) => void;
  viewport: WorkspaceXyflowViewport;
};

const nodeTypes = { workspace: WorkspaceXyflowNode };

function getDragChanges(
  node: WorkspaceXyflowSectionNode,
  nodes: Array<WorkspaceXyflowSectionNode>,
): Array<WorkspaceXyflowNodeChange> {
  const dragNodes = nodes.length === 0 ? [node] : nodes;
  return dragNodes.map((dragNode) => ({
    id: dragNode.id,
    type: "position",
    position: dragNode.position,
    dragging: dragNode.dragging,
  }));
}

export function WorkspaceXyflowAdapter({
  onDragCommit,
  onViewportChange,
  viewport,
}: WorkspaceXyflowAdapterProps) {
  const host = useWorkspaceHost();
  const activeSectionIds = useActiveSections((state) => state.activeIds);
  const canEditLayout = useWorkspaceCapabilities(
    (state) => state.canEditLayout,
  );
  const nodes = useNodeInternals((state) => state.x);
  const sections = useWorkspaceDocument((state) => state.sections);
  const projectedNodes = useMemo(
    () =>
      projectWorkspaceNodesToXyflow({
        activeSectionIds,
        canEditLayout,
        nodes,
        sections,
      }),
    [activeSectionIds, canEditLayout, nodes, sections],
  );
  const [previewNodes, setPreviewNodes] = useState(projectedNodes);
  const previewNodesRef = useRef(projectedNodes);
  const unregisterInstanceRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    previewNodesRef.current = projectedNodes;
    setPreviewNodes(projectedNodes);
  }, [projectedNodes]);

  useEffect(
    () => () => {
      unregisterInstanceRef.current?.();
      unregisterInstanceRef.current = null;
    },
    [host],
  );

  const updatePreview = useCallback(
    (changes: ReadonlyArray<WorkspaceXyflowNodeChange>) => {
      const nextNodes = applyTransientWorkspaceXyflowNodeChanges(
        previewNodesRef.current,
        changes,
      );
      if (nextNodes !== previewNodesRef.current) {
        previewNodesRef.current = nextNodes;
        setPreviewNodes(nextNodes);
      }
      return nextNodes;
    },
    [],
  );

  const handleNodesChange = useCallback(
    (changes: Array<WorkspaceXyflowNodeChange>) => {
      updatePreview(changes);
    },
    [updatePreview],
  );

  const handleNodeDrag = useCallback<OnNodeDrag<WorkspaceXyflowSectionNode>>(
    (_event, node, dragNodes) => {
      updatePreview(getDragChanges(node, dragNodes));
    },
    [updatePreview],
  );

  const handleNodeDragStop = useCallback<
    OnNodeDrag<WorkspaceXyflowSectionNode>
  >(
    (_event, node, dragNodes) => {
      const nextNodes = updatePreview(getDragChanges(node, dragNodes));
      onDragCommit?.(nextNodes);
    },
    [onDragCommit, updatePreview],
  );

  const handleNodeClick = useCallback<
    NodeMouseHandler<WorkspaceXyflowSectionNode>
  >(
    (event, node) => {
      applyActiveSectionChange(host, {
        interaction: "section-click",
        sectionId: node.id,
        multiSelectionActive: event.metaKey || event.ctrlKey,
      });
    },
    [host],
  );

  const handlePaneClick = useCallback(() => {
    applyActiveSectionChange(host, { interaction: "pane-click" });
  }, [host]);

  const handleSelectionChange = useCallback<
    OnSelectionChangeFunc<WorkspaceXyflowSectionNode>
  >(
    ({ nodes: selectedNodes }) => {
      applyActiveSectionChange(host, {
        interaction: "selection-rect",
        selectedIds: selectedNodes.map((node) => node.id),
      });
    },
    [host],
  );

  const handleInit = useCallback(
    (instance: Parameters<typeof registerWorkspaceXyflowInstance>[1]) => {
      unregisterInstanceRef.current?.();
      unregisterInstanceRef.current = registerWorkspaceXyflowInstance(
        host,
        instance,
      );
    },
    [host],
  );

  return (
    <ReactFlow<WorkspaceXyflowSectionNode>
      id={getWorkspaceHostDomId(host)}
      nodes={previewNodes}
      edges={[]}
      viewport={viewport}
      onViewportChange={onViewportChange}
      onInit={handleInit}
      onNodesChange={handleNodesChange}
      onNodeDrag={handleNodeDrag}
      onNodeDragStop={handleNodeDragStop}
      onNodeClick={handleNodeClick}
      onPaneClick={handlePaneClick}
      onSelectionChange={handleSelectionChange}
      nodeTypes={nodeTypes}
      noDragClassName={NO_DRAG_CLASS_NAME}
      noPanClassName={NO_PAN_CLASS_NAME}
      noWheelClassName={NO_WHEEL_CLASS_NAME}
      proOptions={{ hideAttribution: true }}
      onlyRenderVisibleElements={false}
      disableKeyboardA11y
      nodesConnectable={false}
      edgesFocusable={false}
      edgesReconnectable={false}
      deleteKeyCode={null}
      selectionKeyCode={null}
      multiSelectionKeyCode={null}
      panActivationKeyCode={null}
      zoomActivationKeyCode={null}
      elevateNodesOnSelect={false}
    />
  );
}
