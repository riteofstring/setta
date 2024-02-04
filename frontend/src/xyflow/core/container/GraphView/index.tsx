import { memo } from "react";

import useOnInitHandler from "../../hooks/useOnInitHandler";
import type { ReactFlowProps } from "../../types";
import FlowRenderer from "../FlowRenderer";
import NodeRenderer from "../NodeRenderer";
import { createNodeTypes } from "../NodeRenderer/utils";
import ViewportWrapper from "../Viewport";
import { useNodeOrEdgeTypes } from "./utils";

export type GraphViewProps = Omit<
  ReactFlowProps,
  "onSelectionChange" | "nodes" | "nodeTypes"
> &
  Required<
    Pick<
      ReactFlowProps,
      | "nodeTypes"
      | "selectionKeyCode"
      | "deleteKeyCode"
      | "multiSelectionKeyCode"
      | "translateExtent"
      | "minZoom"
      | "maxZoom"
      | "selectNodesOnDrag"
      | "noDragClassName"
      | "noDragClassName"
      | "noWheelClassName"
      | "noPanClassName"
      | "defaultViewport"
    >
  >;

const GraphView = ({
  nodeTypes,
  onMove,
  onMoveStart,
  onMoveEnd,
  onInit,
  onNodeClick,
  onNodeDoubleClick,
  onNodeMouseEnter,
  onNodeMouseMove,
  onNodeMouseLeave,
  onNodeContextMenu,
  onSelectionContextMenu,
  onSelectionStart,
  onSelectionEnd,
  selectionKeyCode,
  selectionOnDrag,
  selectionMode,
  multiSelectionKeyCode,
  panActivationKeyCode,
  zoomActivationKeyCode,
  deleteKeyCode,
  elementsSelectable,
  selectNodesOnDrag,
  defaultViewport,
  translateExtent,
  minZoom,
  maxZoom,
  preventScrolling,
  zoomOnScroll,
  zoomOnPinch,
  panOnScroll,
  panOnScrollSpeed,
  panOnScrollMode,
  zoomOnDoubleClick,
  panOnDrag,
  onPaneClick,
  onPaneMouseEnter,
  onPaneMouseMove,
  onPaneMouseLeave,
  onPaneScroll,
  onPaneContextMenu,
  noDragClassName,
  noWheelClassName,
  noPanClassName,
  getNodesInsideSelection,
}: GraphViewProps) => {
  const nodeTypesWrapped = useNodeOrEdgeTypes(nodeTypes, createNodeTypes);

  useOnInitHandler(onInit);

  return (
    <FlowRenderer
      onPaneClick={onPaneClick}
      onPaneMouseEnter={onPaneMouseEnter}
      onPaneMouseMove={onPaneMouseMove}
      onPaneMouseLeave={onPaneMouseLeave}
      onPaneContextMenu={onPaneContextMenu}
      onPaneScroll={onPaneScroll}
      deleteKeyCode={deleteKeyCode}
      selectionKeyCode={selectionKeyCode}
      selectionOnDrag={selectionOnDrag}
      selectionMode={selectionMode}
      onSelectionStart={onSelectionStart}
      onSelectionEnd={onSelectionEnd}
      multiSelectionKeyCode={multiSelectionKeyCode}
      panActivationKeyCode={panActivationKeyCode}
      zoomActivationKeyCode={zoomActivationKeyCode}
      elementsSelectable={elementsSelectable}
      onMove={onMove}
      onMoveStart={onMoveStart}
      onMoveEnd={onMoveEnd}
      zoomOnScroll={zoomOnScroll}
      zoomOnPinch={zoomOnPinch}
      zoomOnDoubleClick={zoomOnDoubleClick}
      panOnScroll={panOnScroll}
      panOnScrollSpeed={panOnScrollSpeed}
      panOnScrollMode={panOnScrollMode}
      panOnDrag={panOnDrag}
      defaultViewport={defaultViewport}
      translateExtent={translateExtent}
      minZoom={minZoom}
      maxZoom={maxZoom}
      onSelectionContextMenu={onSelectionContextMenu}
      preventScrolling={preventScrolling}
      noDragClassName={noDragClassName}
      noWheelClassName={noWheelClassName}
      noPanClassName={noPanClassName}
      getNodesInsideSelection={getNodesInsideSelection}
    >
      <ViewportWrapper>
        <NodeRenderer
          nodeTypes={nodeTypesWrapped}
          onNodeClick={onNodeClick}
          onNodeDoubleClick={onNodeDoubleClick}
          onNodeMouseEnter={onNodeMouseEnter}
          onNodeMouseMove={onNodeMouseMove}
          onNodeMouseLeave={onNodeMouseLeave}
          onNodeContextMenu={onNodeContextMenu}
          selectNodesOnDrag={selectNodesOnDrag}
          noPanClassName={noPanClassName}
          noDragClassName={noDragClassName}
        />
      </ViewportWrapper>
    </FlowRenderer>
  );
};

GraphView.displayName = "GraphView";

export default memo(GraphView);
