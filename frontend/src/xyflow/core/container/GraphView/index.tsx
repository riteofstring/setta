import { memo } from "react";

import useOnInitHandler from "../../hooks/useOnInitHandler";
import type { ReactFlowProps } from "../../types";
import FlowRenderer from "../FlowRenderer";
import NodeRenderer from "../NodeRenderer";
import { createNodeTypes } from "../NodeRenderer/utils";
import ViewportWrapper from "../Viewport";
import { useNodeOrEdgeTypes } from "./utils";

export type GraphViewProps = Omit<ReactFlowProps, "nodes" | "nodeTypes"> &
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
  onMoveStart,
  onMoveEnd,
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
  onPaneContextMenu,
  noDragClassName,
  noWheelClassName,
  noPanClassName,
}: GraphViewProps) => {
  const nodeTypesWrapped = useNodeOrEdgeTypes(nodeTypes, createNodeTypes);

  useOnInitHandler();

  return (
    <FlowRenderer
      onPaneClick={onPaneClick}
      onPaneContextMenu={onPaneContextMenu}
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
      preventScrolling={preventScrolling}
      noDragClassName={noDragClassName}
      noWheelClassName={noWheelClassName}
      noPanClassName={noPanClassName}
    >
      <ViewportWrapper>
        <NodeRenderer
          nodeTypes={nodeTypesWrapped}
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
