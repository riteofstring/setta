import type { ReactNode } from "react";
import { memo } from "react";

import { NodesSelectionWrapper } from "forks/xyflow/core/components/NodesSelection/NodesSelection";
import useGlobalKeyHandler from "../../hooks/useGlobalKeyHandler";
import useKeyPress from "../../hooks/useKeyPress";
import { useReactFlow } from "../../store";
import { GraphViewProps } from "../GraphView";
import Pane from "../Pane";
import ZoomPane from "../ZoomPane";

export type FlowRendererProps = Omit<
  GraphViewProps,
  "arrowHeadColor" | "selectNodesOnDrag"
> & {
  children: ReactNode;
};

const FlowRenderer = ({
  children,
  selectionOnDrag,
  selectionMode,
  multiSelectionKeyCode,
  zoomActivationKeyCode,
  elementsSelectable,
  zoomOnScroll,
  zoomOnPinch,
  panOnScroll,
  panOnScrollSpeed,
  panOnScrollMode,
  zoomOnDoubleClick,
  panOnDrag,
  translateExtent,
  preventScrolling,
  noWheelClassName,
  noPanClassName,
}: FlowRendererProps) => {
  const selectionKeyPressed = useReactFlow((x) => x.selectionKeyPressed);
  const isSelecting =
    selectionKeyPressed || (selectionOnDrag && panOnDrag !== true);

  useGlobalKeyHandler({ multiSelectionKeyCode });

  return (
    <ZoomPane
      elementsSelectable={elementsSelectable}
      zoomOnScroll={zoomOnScroll}
      zoomOnPinch={zoomOnPinch}
      panOnScroll={panOnScroll}
      panOnScrollSpeed={panOnScrollSpeed}
      panOnScrollMode={panOnScrollMode}
      zoomOnDoubleClick={zoomOnDoubleClick}
      panOnDrag={!selectionKeyPressed && panOnDrag}
      translateExtent={translateExtent}
      zoomActivationKeyCode={zoomActivationKeyCode}
      preventScrolling={preventScrolling}
      noWheelClassName={noWheelClassName}
      noPanClassName={noPanClassName}
    >
      <Pane
        panOnDrag={panOnDrag}
        isSelecting={!!isSelecting}
        selectionMode={selectionMode}
      >
        {children}
        <NodesSelectionWrapper />
      </Pane>
    </ZoomPane>
  );
};

FlowRenderer.displayName = "FlowRenderer";

export default memo(FlowRenderer);
