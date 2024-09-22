import { forwardRef, type CSSProperties } from "react";
import StoreUpdater from "../../components/StoreUpdater";
import { infiniteExtent } from "../../store/initialState";
import type { ReactFlowProps, ReactFlowRefType } from "../../types";
import { PanOnScrollMode, SelectionMode } from "../../types";
import GraphView from "../GraphView";

const wrapperStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  overflow: "hidden",
  position: "relative",
  userSelect: "none", //to prevent text from being selected when shift clicking or right-clicking pane
};

const ReactFlow = forwardRef<ReactFlowRefType, ReactFlowProps>(
  (
    {
      className,
      selectionOnDrag = false,
      selectionMode = SelectionMode.Full,
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
      autoPanOnNodeDrag = true,
      ...rest
    },
    ref,
  ) => {
    return (
      <div
        {...rest}
        style={wrapperStyle}
        ref={ref}
        className="react-flow setta-light dark:setta-dark"
        data-testid="rf__wrapper"
      >
        <GraphView
          selectionOnDrag={selectionOnDrag}
          selectionMode={selectionMode}
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
          noPanClassName={noPanClassName}
          autoPanOnNodeDrag={autoPanOnNodeDrag}
        />
        {children}
      </div>
    );
  },
);

ReactFlow.displayName = "ReactFlow";

export default ReactFlow;
