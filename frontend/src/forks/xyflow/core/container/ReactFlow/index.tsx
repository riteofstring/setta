import cc from "classcat";
import { forwardRef, type CSSProperties } from "react";
import StoreUpdater from "../../components/StoreUpdater";
import { infiniteExtent } from "../../store/initialState";
import type { ReactFlowProps, ReactFlowRefType } from "../../types";
import { PanOnScrollMode, SelectionMode } from "../../types";
import { isMacOs } from "../../utils";
import GraphView from "../GraphView";

const wrapperStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  overflow: "hidden",
  position: "relative",
};

const ReactFlow = forwardRef<ReactFlowRefType, ReactFlowProps>(
  (
    {
      className,
      selectionKeyCode = "Shift",
      selectionOnDrag = false,
      selectionMode = SelectionMode.Full,
      panActivationKeyCode = "Space",
      multiSelectionKeyCode = isMacOs() ? "Meta" : "Control",
      zoomActivationKeyCode = isMacOs() ? "Meta" : "Control",
      selectNodesOnDrag = true,
      nodesDraggable,
      nodesFocusable,
      elementsSelectable,
      translateExtent = infiniteExtent,
      preventScrolling = true,
      zoomOnScroll = true,
      zoomOnPinch = true,
      panOnScroll = false,
      panOnScrollSpeed = 0.5,
      panOnScrollMode = PanOnScrollMode.Free,
      zoomOnDoubleClick = true,
      panOnDrag = true,
      children,
      noDragClassName = "nodrag",
      noWheelClassName = "nowheel",
      noPanClassName = "nopan",
      fitView = false,
      fitViewOptions,
      autoPanOnNodeDrag = true,
      style,
      id,
      nodeDragThreshold,
      ...rest
    },
    ref,
  ) => {
    return (
      <div
        {...rest}
        style={{ ...style, ...wrapperStyle }}
        ref={ref}
        className={cc(["react-flow", className])}
        data-testid="rf__wrapper"
        id={id}
      >
        <GraphView
          selectionKeyCode={selectionKeyCode}
          selectionOnDrag={selectionOnDrag}
          selectionMode={selectionMode}
          multiSelectionKeyCode={multiSelectionKeyCode}
          panActivationKeyCode={panActivationKeyCode}
          zoomActivationKeyCode={zoomActivationKeyCode}
          selectNodesOnDrag={selectNodesOnDrag}
          translateExtent={translateExtent}
          preventScrolling={preventScrolling}
          zoomOnScroll={zoomOnScroll}
          zoomOnPinch={zoomOnPinch}
          zoomOnDoubleClick={zoomOnDoubleClick}
          panOnScroll={panOnScroll}
          panOnScrollSpeed={panOnScrollSpeed}
          panOnScrollMode={panOnScrollMode}
          panOnDrag={panOnDrag}
          noDragClassName={noDragClassName}
          noWheelClassName={noWheelClassName}
          noPanClassName={noPanClassName}
        />
        <StoreUpdater
          nodesDraggable={nodesDraggable}
          nodesFocusable={nodesFocusable}
          elementsSelectable={elementsSelectable}
          translateExtent={translateExtent}
          fitView={fitView}
          fitViewOptions={fitViewOptions}
          noPanClassName={noPanClassName}
          autoPanOnNodeDrag={autoPanOnNodeDrag}
          nodeDragThreshold={nodeDragThreshold}
        />
        {children}
      </div>
    );
  },
);

ReactFlow.displayName = "ReactFlow";

export default ReactFlow;
