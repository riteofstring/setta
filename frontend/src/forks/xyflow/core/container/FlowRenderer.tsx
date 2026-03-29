import {
  LiveDictAreaPixiPageRuntimeBoundary,
  LiveDictAreaPixiPageRuntimeHost,
} from "components/Params/LiveDictAreaPixiPageRuntime";
import {
  NodesSelectionDragHandleWrapper,
  NodesSelectionWrapper,
} from "forks/xyflow/core/components/NodesSelection";
import _ from "lodash";
import { memo, type ReactNode } from "react";
import { useAIFollow, useSettings } from "state/definitions";
import { useReactFlow } from "../store";
import { buildFlowRendererView } from "./flowRendererView";
import Pane from "./Pane";
import ZoomPane from "./ZoomPane";

type FlowRendererProps = {
  children: ReactNode;
  wrapperDimensions: { width: number; height: number };
};

const FlowRenderer = ({ children, wrapperDimensions }: FlowRendererProps) => {
  const { zoomActivationKeyPressed, selectionKeyPressed } = useReactFlow(
    (x) => {
      return {
        zoomActivationKeyPressed: x.zoomActivationKeyPressed,
        selectionKeyPressed: x.selectionKeyPressed,
      };
    },
    _.isEqual,
  );

  const isFollowTransitioning = useAIFollow(
    (state) => state.isFollowTransitioning,
  );

  const {
    panOnDrag,
    panOnScroll,
    panOnScrollSpeed,
    panOnScrollMode,
    zoomOnScroll,
    zoomOnPinch,
    zoomOnDoubleClick,
  } = useSettings((x) => {
    return {
      panOnDrag: x.gui.panOnDrag,
      panOnScroll: x.gui.panOnScroll,
      panOnScrollSpeed: x.gui.panOnScrollSpeed,
      panOnScrollMode: x.gui.panOnScrollMode,
      zoomOnScroll: x.gui.zoomOnScroll,
      zoomOnPinch: x.gui.zoomOnPinch,
      zoomOnDoubleClick: x.gui.zoomOnDoubleClick,
    };
  }, _.isEqual);

  const flowRendererView = buildFlowRendererView({
    isFollowTransitioning,
    panOnDrag,
    panOnScroll,
    panOnScrollMode,
    panOnScrollSpeed,
    selectionKeyPressed,
    zoomActivationKeyPressed,
    zoomOnDoubleClick,
    zoomOnPinch,
    zoomOnScroll,
  });

  return (
    <LiveDictAreaPixiPageRuntimeBoundary>
      <ZoomPane
        {...flowRendererView.zoomPaneProps}
        wrapperDimensions={wrapperDimensions}
      >
        <Pane {...flowRendererView.paneProps}>
          <LiveDictAreaPixiPageRuntimeHost />
          <NodesSelectionDragHandleWrapper />
          {children}
          <NodesSelectionWrapper />
        </Pane>
      </ZoomPane>
    </LiveDictAreaPixiPageRuntimeBoundary>
  );
};

FlowRenderer.displayName = "FlowRenderer";

export default memo(FlowRenderer);
