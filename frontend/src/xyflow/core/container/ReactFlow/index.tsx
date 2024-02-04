import cc from "classcat";
import { forwardRef, type CSSProperties } from "react";

import StoreUpdater from "../../components/StoreUpdater";
import { infiniteExtent } from "../../store/initialState";
import type { ReactFlowProps, ReactFlowRefType, Viewport } from "../../types";
import { PanOnScrollMode, SelectionMode } from "../../types";
import { isMacOs } from "../../utils";
import GraphView from "../GraphView";
import Wrapper from "./Wrapper";

const initSnapGrid: [number, number] = [15, 15];
const initDefaultViewport: Viewport = { x: 0, y: 0, zoom: 1 };

const wrapperStyle: CSSProperties = {
  width: "100%",
  height: "100%",
  overflow: "hidden",
  position: "relative",
};

const ReactFlow = forwardRef<ReactFlowRefType, ReactFlowProps>(
  (
    {
      nodes,
      className,
      nodeTypes,
      onInit,
      onMove,
      onMoveStart,
      onMoveEnd,
      onNodeContextMenu,
      onNodeDragStart,
      onNodeDragStop,
      onNodesDelete,
      onSelectionChange,
      onSelectionDragStop,
      onSelectionContextMenu,
      onSelectionStart,
      onSelectionEnd,
      deleteKeyCode = "Backspace",
      selectionKeyCode = "Shift",
      selectionOnDrag = false,
      selectionMode = SelectionMode.Full,
      panActivationKeyCode = "Space",
      multiSelectionKeyCode = isMacOs() ? "Meta" : "Control",
      zoomActivationKeyCode = isMacOs() ? "Meta" : "Control",
      snapToGrid = false,
      snapGrid = initSnapGrid,
      selectNodesOnDrag = true,
      nodesDraggable,
      nodesFocusable,
      elementsSelectable,
      defaultViewport = initDefaultViewport,
      minZoom = 0.5,
      maxZoom = 2,
      translateExtent = infiniteExtent,
      preventScrolling = true,
      zoomOnScroll = true,
      zoomOnPinch = true,
      panOnScroll = false,
      panOnScrollSpeed = 0.5,
      panOnScrollMode = PanOnScrollMode.Free,
      zoomOnDoubleClick = true,
      panOnDrag = true,
      onPaneClick,
      onPaneContextMenu,
      children,
      onNodesChange,
      noDragClassName = "nodrag",
      noWheelClassName = "nowheel",
      noPanClassName = "nopan",
      fitView = false,
      fitViewOptions,
      autoPanOnNodeDrag = true,
      onError,
      style,
      id,
      nodeDragThreshold,
      getNodesInsideSelection,
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
        <Wrapper>
          <GraphView
            onInit={onInit}
            onMove={onMove}
            onMoveStart={onMoveStart}
            onMoveEnd={onMoveEnd}
            onNodeContextMenu={onNodeContextMenu}
            nodeTypes={nodeTypes}
            selectionKeyCode={selectionKeyCode}
            selectionOnDrag={selectionOnDrag}
            selectionMode={selectionMode}
            deleteKeyCode={deleteKeyCode}
            multiSelectionKeyCode={multiSelectionKeyCode}
            panActivationKeyCode={panActivationKeyCode}
            zoomActivationKeyCode={zoomActivationKeyCode}
            selectNodesOnDrag={selectNodesOnDrag}
            defaultViewport={defaultViewport}
            translateExtent={translateExtent}
            minZoom={minZoom}
            maxZoom={maxZoom}
            preventScrolling={preventScrolling}
            zoomOnScroll={zoomOnScroll}
            zoomOnPinch={zoomOnPinch}
            zoomOnDoubleClick={zoomOnDoubleClick}
            panOnScroll={panOnScroll}
            panOnScrollSpeed={panOnScrollSpeed}
            panOnScrollMode={panOnScrollMode}
            panOnDrag={panOnDrag}
            onPaneClick={onPaneClick}
            onPaneContextMenu={onPaneContextMenu}
            onSelectionContextMenu={onSelectionContextMenu}
            onSelectionStart={onSelectionStart}
            onSelectionEnd={onSelectionEnd}
            noDragClassName={noDragClassName}
            noWheelClassName={noWheelClassName}
            noPanClassName={noPanClassName}
            getNodesInsideSelection={getNodesInsideSelection}
          />
          <StoreUpdater
            nodes={nodes}
            nodesDraggable={nodesDraggable}
            nodesFocusable={nodesFocusable}
            elementsSelectable={elementsSelectable}
            minZoom={minZoom}
            maxZoom={maxZoom}
            onNodesChange={onNodesChange}
            snapToGrid={snapToGrid}
            snapGrid={snapGrid}
            translateExtent={translateExtent}
            fitView={fitView}
            fitViewOptions={fitViewOptions}
            onNodesDelete={onNodesDelete}
            onNodeDragStart={onNodeDragStart}
            onNodeDragStop={onNodeDragStop}
            onSelectionDragStop={onSelectionDragStop}
            noPanClassName={noPanClassName}
            autoPanOnNodeDrag={autoPanOnNodeDrag}
            onError={onError}
            nodeDragThreshold={nodeDragThreshold}
          />
          {children}
        </Wrapper>
      </div>
    );
  },
);

ReactFlow.displayName = "ReactFlow";

export default ReactFlow;
