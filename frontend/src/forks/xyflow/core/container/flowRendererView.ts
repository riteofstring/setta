import { PanOnScrollModeEnum } from "utils/generatedTypes";

export type FlowRendererPanOnDrag = boolean | number[];

type BuildFlowRendererViewArgs = {
  isFollowTransitioning: boolean;
  panOnDrag: FlowRendererPanOnDrag;
  panOnScroll: boolean;
  panOnScrollMode: PanOnScrollModeEnum;
  panOnScrollSpeed: number;
  selectionKeyPressed: boolean;
  zoomActivationKeyPressed: boolean;
  zoomOnDoubleClick: boolean;
  zoomOnPinch: boolean;
  zoomOnScroll: boolean;
};

export type FlowRendererView = {
  paneProps: {
    isSelecting: boolean;
    panOnDrag: FlowRendererPanOnDrag;
  };
  zoomPaneProps: {
    panOnDrag: FlowRendererPanOnDrag;
    panOnScroll: boolean;
    panOnScrollMode: PanOnScrollModeEnum;
    panOnScrollSpeed: number;
    zoomActivationKeyPressed: boolean;
    zoomOnDoubleClick: boolean;
    zoomOnPinch: boolean;
    zoomOnScroll: boolean;
  };
};

export function buildFlowRendererView({
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
}: BuildFlowRendererViewArgs): FlowRendererView {
  const followAwarePanOnDrag = isFollowTransitioning ? false : panOnDrag;

  return {
    paneProps: {
      isSelecting: selectionKeyPressed,
      panOnDrag: followAwarePanOnDrag,
    },
    zoomPaneProps: {
      panOnDrag: selectionKeyPressed ? false : followAwarePanOnDrag,
      panOnScroll: !isFollowTransitioning && panOnScroll,
      panOnScrollMode,
      panOnScrollSpeed,
      zoomActivationKeyPressed:
        !isFollowTransitioning && zoomActivationKeyPressed,
      zoomOnDoubleClick: !isFollowTransitioning && zoomOnDoubleClick,
      zoomOnPinch: !isFollowTransitioning && zoomOnPinch,
      zoomOnScroll: !isFollowTransitioning && zoomOnScroll,
    },
  };
}
