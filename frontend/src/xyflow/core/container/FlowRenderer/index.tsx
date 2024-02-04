import type { ReactNode } from "react";
import { memo } from "react";

import useGlobalKeyHandler from "../../hooks/useGlobalKeyHandler";
import useKeyPress from "../../hooks/useKeyPress";
import { useStore } from "../../hooks/useStore";
import type { ReactFlowState } from "../../types";
import { GraphViewProps } from "../GraphView";
import Pane from "../Pane";
import ZoomPane from "../ZoomPane";

export type FlowRendererProps = Omit<
  GraphViewProps,
  | "snapToGrid"
  | "nodeTypes"
  | "snapGrid"
  | "arrowHeadColor"
  | "onlyRenderVisibleElements"
  | "selectNodesOnDrag"
  | "nodeOrigin"
> & {
  children: ReactNode;
};

const selector = (s: ReactFlowState) => s.nodesSelectionActive;

const FlowRenderer = ({
  children,
  onPaneClick,
  onPaneMouseEnter,
  onPaneMouseMove,
  onPaneMouseLeave,
  onPaneContextMenu,
  onPaneScroll,
  deleteKeyCode,
  onMove,
  onMoveStart,
  onMoveEnd,
  selectionKeyCode,
  selectionOnDrag,
  selectionMode,
  onSelectionStart,
  onSelectionEnd,
  multiSelectionKeyCode,
  panActivationKeyCode,
  zoomActivationKeyCode,
  elementsSelectable,
  zoomOnScroll,
  zoomOnPinch,
  panOnScroll: _panOnScroll,
  panOnScrollSpeed,
  panOnScrollMode,
  zoomOnDoubleClick,
  panOnDrag: _panOnDrag,
  defaultViewport,
  translateExtent,
  minZoom,
  maxZoom,
  preventScrolling,
  onSelectionContextMenu,
  noWheelClassName,
  noPanClassName,
  disableKeyboardA11y,
  getNodesInsideSelection,
}: FlowRendererProps) => {
  const nodesSelectionActive = useStore(selector);
  const selectionKeyPressed = useKeyPress(selectionKeyCode);
  const panActivationKeyPressed = useKeyPress(panActivationKeyCode);

  const panOnDrag = panActivationKeyPressed || _panOnDrag;
  const panOnScroll = panActivationKeyPressed || _panOnScroll;
  const isSelecting =
    selectionKeyPressed || (selectionOnDrag && panOnDrag !== true);

  useGlobalKeyHandler({ deleteKeyCode, multiSelectionKeyCode });

  return (
    <ZoomPane
      onMove={onMove}
      onMoveStart={onMoveStart}
      onMoveEnd={onMoveEnd}
      onPaneContextMenu={onPaneContextMenu}
      elementsSelectable={elementsSelectable}
      zoomOnScroll={zoomOnScroll}
      zoomOnPinch={zoomOnPinch}
      panOnScroll={panOnScroll}
      panOnScrollSpeed={panOnScrollSpeed}
      panOnScrollMode={panOnScrollMode}
      zoomOnDoubleClick={zoomOnDoubleClick}
      panOnDrag={!selectionKeyPressed && panOnDrag}
      defaultViewport={defaultViewport}
      translateExtent={translateExtent}
      minZoom={minZoom}
      maxZoom={maxZoom}
      zoomActivationKeyCode={zoomActivationKeyCode}
      preventScrolling={preventScrolling}
      noWheelClassName={noWheelClassName}
      noPanClassName={noPanClassName}
    >
      <Pane
        onSelectionStart={onSelectionStart}
        onSelectionEnd={onSelectionEnd}
        onPaneClick={onPaneClick}
        onPaneMouseEnter={onPaneMouseEnter}
        onPaneMouseMove={onPaneMouseMove}
        onPaneMouseLeave={onPaneMouseLeave}
        onPaneContextMenu={onPaneContextMenu}
        onPaneScroll={onPaneScroll}
        getNodesInsideSelection={getNodesInsideSelection}
        panOnDrag={panOnDrag}
        isSelecting={!!isSelecting}
        selectionMode={selectionMode}
      >
        {children}
      </Pane>
    </ZoomPane>
  );
};

FlowRenderer.displayName = "FlowRenderer";

export default memo(FlowRenderer);
