import { PanOnScrollModeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { buildFlowRendererView } from "./flowRendererView";

describe("buildFlowRendererView", () => {
  it("disables viewport interactions while ai follow is transitioning", () => {
    // Preserve the existing follow-transition gate so pan/zoom controls cannot fight the scripted camera move.
    expect(
      buildFlowRendererView({
        isFollowTransitioning: true,
        panOnDrag: [1],
        panOnScroll: true,
        panOnScrollMode: PanOnScrollModeEnum.free,
        panOnScrollSpeed: 0.5,
        selectionKeyPressed: false,
        zoomActivationKeyPressed: true,
        zoomOnDoubleClick: true,
        zoomOnPinch: true,
        zoomOnScroll: true,
      }),
    ).toEqual({
      paneProps: {
        isSelecting: false,
        panOnDrag: false,
      },
      zoomPaneProps: {
        panOnDrag: false,
        panOnScroll: false,
        panOnScrollMode: PanOnScrollModeEnum.free,
        panOnScrollSpeed: 0.5,
        zoomActivationKeyPressed: false,
        zoomOnDoubleClick: false,
        zoomOnPinch: false,
        zoomOnScroll: false,
      },
    });
  });

  it("keeps pane dragging active while selection mode suppresses zoom-pane drag panning", () => {
    // Preserve the current split behavior where selection mode still lets the pane know drag is enabled, but blocks viewport drag panning.
    expect(
      buildFlowRendererView({
        isFollowTransitioning: false,
        panOnDrag: [0, 1],
        panOnScroll: true,
        panOnScrollMode: PanOnScrollModeEnum.horizontal,
        panOnScrollSpeed: 2,
        selectionKeyPressed: true,
        zoomActivationKeyPressed: true,
        zoomOnDoubleClick: true,
        zoomOnPinch: true,
        zoomOnScroll: true,
      }),
    ).toEqual({
      paneProps: {
        isSelecting: true,
        panOnDrag: [0, 1],
      },
      zoomPaneProps: {
        panOnDrag: false,
        panOnScroll: true,
        panOnScrollMode: PanOnScrollModeEnum.horizontal,
        panOnScrollSpeed: 2,
        zoomActivationKeyPressed: true,
        zoomOnDoubleClick: true,
        zoomOnPinch: true,
        zoomOnScroll: true,
      },
    });
  });

  it("passes through the configured pan and zoom settings in the normal interactive state", () => {
    // Preserve the default viewport settings path when neither selection mode nor follow transition is overriding it.
    expect(
      buildFlowRendererView({
        isFollowTransitioning: false,
        panOnDrag: [2],
        panOnScroll: false,
        panOnScrollMode: PanOnScrollModeEnum.vertical,
        panOnScrollSpeed: 1.25,
        selectionKeyPressed: false,
        zoomActivationKeyPressed: false,
        zoomOnDoubleClick: false,
        zoomOnPinch: true,
        zoomOnScroll: true,
      }),
    ).toEqual({
      paneProps: {
        isSelecting: false,
        panOnDrag: [2],
      },
      zoomPaneProps: {
        panOnDrag: [2],
        panOnScroll: false,
        panOnScrollMode: PanOnScrollModeEnum.vertical,
        panOnScrollSpeed: 1.25,
        zoomActivationKeyPressed: false,
        zoomOnDoubleClick: false,
        zoomOnPinch: true,
        zoomOnScroll: true,
      },
    });
  });
});
