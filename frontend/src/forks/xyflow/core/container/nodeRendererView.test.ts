import { describe, expect, it } from "vitest";
import { buildNodeRendererView } from "./nodeRendererView";

describe("buildNodeRendererView", () => {
  it("keeps node wrappers visible and draggable in the normal interactive state", () => {
    // Preserve the default graph-surface behavior once the initial visibility gate has opened.
    expect(
      buildNodeRendererView({
        nodeIds: ["section-a", "section-b"],
        panActivationKeyPressed: false,
        readyToBeVisible: true,
        resizeObserver: null,
      }),
    ).toEqual({
      nodeWrappers: [
        {
          id: "section-a",
          isDraggable: true,
          resizeObserver: null,
          visibility: "visible",
        },
        {
          id: "section-b",
          isDraggable: true,
          resizeObserver: null,
          visibility: "visible",
        },
      ],
    });
  });

  it("hides node wrappers and suppresses dragging while the canvas is still gating visibility", () => {
    // Preserve the fit-view startup gate so nodes stay hidden and non-draggable until the scene is ready.
    expect(
      buildNodeRendererView({
        nodeIds: ["section-a"],
        panActivationKeyPressed: true,
        readyToBeVisible: false,
        resizeObserver: null,
      }),
    ).toEqual({
      nodeWrappers: [
        {
          id: "section-a",
          isDraggable: false,
          resizeObserver: null,
          visibility: "hidden",
        },
      ],
    });
  });
});
