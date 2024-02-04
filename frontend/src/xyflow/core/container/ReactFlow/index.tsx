import cc from "classcat";
import { forwardRef, type CSSProperties } from "react";

import SelectionListener from "../../components/SelectionListener";
import StoreUpdater from "../../components/StoreUpdater";
import { infiniteExtent } from "../../store/initialState";
import type {
  NodeOrigin,
  ReactFlowProps,
  ReactFlowRefType,
  Viewport,
} from "../../types";
import { PanOnScrollMode, SelectionMode } from "../../types";
import { isMacOs } from "../../utils";
import GraphView from "../GraphView";
import Wrapper from "./Wrapper";

const initNodeOrigin: NodeOrigin = [0, 0];
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
      defaultNodes,
      className,
      nodeTypes,
      onNodeClick,
      onInit,
      onMove,
      onMoveStart,
      onMoveEnd,
      onNodeMouseEnter,
      onNodeMouseMove,
      onNodeMouseLeave,
      onNodeContextMenu,
      onNodeDoubleClick,
      onNodeDragStart,
      onNodeDrag,
      onNodeDragStop,
      onNodesDelete,
      onSelectionChange,
      onSelectionDragStart,
      onSelectionDrag,
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
      onlyRenderVisibleElements = false,
      selectNodesOnDrag = true,
      nodesDraggable,
      nodesFocusable,
      nodeOrigin = initNodeOrigin,
      elementsSelectable,
      defaultViewport = initDefaultViewport,
      minZoom = 0.5,
      maxZoom = 2,
      translateExtent = infiniteExtent,
      preventScrolling = true,
      nodeExtent,
      zoomOnScroll = true,
      zoomOnPinch = true,
      panOnScroll = false,
      panOnScrollSpeed = 0.5,
      panOnScrollMode = PanOnScrollMode.Free,
      zoomOnDoubleClick = true,
      panOnDrag = true,
      onPaneClick,
      onPaneMouseEnter,
      onPaneMouseMove,
      onPaneMouseLeave,
      onPaneScroll,
      onPaneContextMenu,
      children,
      onNodesChange,
      noDragClassName = "nodrag",
      noWheelClassName = "nowheel",
      noPanClassName = "nopan",
      fitView = false,
      fitViewOptions,
      disableKeyboardA11y = false,
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
    const rfId = id || "1";

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
            onNodeClick={onNodeClick}
            onNodeMouseEnter={onNodeMouseEnter}
            onNodeMouseMove={onNodeMouseMove}
            onNodeMouseLeave={onNodeMouseLeave}
            onNodeContextMenu={onNodeContextMenu}
            onNodeDoubleClick={onNodeDoubleClick}
            nodeTypes={nodeTypes}
            selectionKeyCode={selectionKeyCode}
            selectionOnDrag={selectionOnDrag}
            selectionMode={selectionMode}
            deleteKeyCode={deleteKeyCode}
            multiSelectionKeyCode={multiSelectionKeyCode}
            panActivationKeyCode={panActivationKeyCode}
            zoomActivationKeyCode={zoomActivationKeyCode}
            onlyRenderVisibleElements={onlyRenderVisibleElements}
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
            onPaneMouseEnter={onPaneMouseEnter}
            onPaneMouseMove={onPaneMouseMove}
            onPaneMouseLeave={onPaneMouseLeave}
            onPaneScroll={onPaneScroll}
            onPaneContextMenu={onPaneContextMenu}
            onSelectionContextMenu={onSelectionContextMenu}
            onSelectionStart={onSelectionStart}
            onSelectionEnd={onSelectionEnd}
            noDragClassName={noDragClassName}
            noWheelClassName={noWheelClassName}
            noPanClassName={noPanClassName}
            rfId={rfId}
            disableKeyboardA11y={disableKeyboardA11y}
            nodeOrigin={nodeOrigin}
            nodeExtent={nodeExtent}
            getNodesInsideSelection={getNodesInsideSelection}
          />
          <StoreUpdater
            nodes={nodes}
            defaultNodes={defaultNodes}
            nodesDraggable={nodesDraggable}
            nodesFocusable={nodesFocusable}
            elementsSelectable={elementsSelectable}
            minZoom={minZoom}
            maxZoom={maxZoom}
            nodeExtent={nodeExtent}
            onNodesChange={onNodesChange}
            snapToGrid={snapToGrid}
            snapGrid={snapGrid}
            translateExtent={translateExtent}
            fitView={fitView}
            fitViewOptions={fitViewOptions}
            onNodesDelete={onNodesDelete}
            onNodeDragStart={onNodeDragStart}
            onNodeDrag={onNodeDrag}
            onNodeDragStop={onNodeDragStop}
            onSelectionDrag={onSelectionDrag}
            onSelectionDragStart={onSelectionDragStart}
            onSelectionDragStop={onSelectionDragStop}
            noPanClassName={noPanClassName}
            nodeOrigin={nodeOrigin}
            rfId={rfId}
            autoPanOnNodeDrag={autoPanOnNodeDrag}
            onError={onError}
            nodeDragThreshold={nodeDragThreshold}
          />
          <SelectionListener onSelectionChange={onSelectionChange} />
          {children}
        </Wrapper>
      </div>
    );
  },
);

ReactFlow.displayName = "ReactFlow";

export default ReactFlow;
