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
  "onSelectionChange" | "nodes" | "edges" | "nodeTypes" | "edgeTypes"
> &
  Required<
    Pick<
      ReactFlowProps,
      | "nodeTypes"
      | "edgeTypes"
      | "selectionKeyCode"
      | "deleteKeyCode"
      | "multiSelectionKeyCode"
      | "onlyRenderVisibleElements"
      | "translateExtent"
      | "minZoom"
      | "maxZoom"
      | "defaultMarkerColor"
      | "selectNodesOnDrag"
      | "noDragClassName"
      | "noDragClassName"
      | "noWheelClassName"
      | "noPanClassName"
      | "defaultViewport"
      | "disableKeyboardA11y"
      | "nodeOrigin"
    >
  > & {
    rfId: string;
  };

const GraphView = ({
  nodeTypes,
  edgeTypes,
  onMove,
  onMoveStart,
  onMoveEnd,
  onInit,
  onNodeClick,
  onEdgeClick,
  onNodeDoubleClick,
  onEdgeDoubleClick,
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
  onlyRenderVisibleElements,
  elementsSelectable,
  selectNodesOnDrag,
  defaultViewport,
  translateExtent,
  minZoom,
  maxZoom,
  preventScrolling,
  defaultMarkerColor,
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
  onEdgeUpdate,
  onEdgeContextMenu,
  onEdgeMouseEnter,
  onEdgeMouseMove,
  onEdgeMouseLeave,
  edgeUpdaterRadius,
  onEdgeUpdateStart,
  onEdgeUpdateEnd,
  noDragClassName,
  noWheelClassName,
  noPanClassName,
  elevateEdgesOnSelect,
  disableKeyboardA11y,
  nodeOrigin,
  nodeExtent,
  rfId,
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
      disableKeyboardA11y={disableKeyboardA11y}
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
          onlyRenderVisibleElements={onlyRenderVisibleElements}
          noPanClassName={noPanClassName}
          noDragClassName={noDragClassName}
          disableKeyboardA11y={disableKeyboardA11y}
          nodeOrigin={nodeOrigin}
          nodeExtent={nodeExtent}
          rfId={rfId}
        />
      </ViewportWrapper>
    </FlowRenderer>
  );
};

GraphView.displayName = "GraphView";

export default memo(GraphView);
