import { describe, expect, it } from "vitest";

import { createGpuRetainedRowContentScene } from "../retainedContentScene";
import type { GpuFlowScene } from "../scene";
import { selectGpuFlowSceneStateFrameReason } from "./flowSceneStateSync";

describe("GPU flow scene state sync", () => {
  it("requests content publication when the retained scene object changes", () => {
    const previousScene = scene("previous");
    const nextScene = scene("next");

    expect(
      selectGpuFlowSceneStateFrameReason({
        nextScene,
        previousScene,
      }),
    ).toBe("manual");
  });

  it("requests critical content publication when a retained DOM control becomes active", () => {
    expect(
      selectGpuFlowSceneStateFrameReason({
        nextScene: retainedDomControlScene(true),
        previousScene: retainedDomControlScene(false),
      }),
    ).toBe("dom-control-activation");
  });

  it("keeps viewport-only frames for non-scene state sync", () => {
    const currentScene = scene("current");

    expect(
      selectGpuFlowSceneStateFrameReason({
        nextScene: currentScene,
        previousScene: currentScene,
      }),
    ).toBe("viewport");
  });
});

function scene(id: string): GpuFlowScene {
  return {
    contentSurfaces: [],
    domIslands: [],
    edges: [],
    revision: id.length,
    sections: [],
  };
}

function retainedDomControlScene(active: boolean): GpuFlowScene {
  return {
    ...scene(active ? "active" : "passive"),
    contentSurfaces: [
      {
        clipRect: { height: 28, width: 160, x: 0, y: 0 },
        id: "surface-a",
        ownerSectionId: "section-a",
        rect: { height: 28, width: 160, x: 0, y: 0 },
        renderer: { kind: "canvas-content", surfaceId: "surface-a" },
        retainedScene: createGpuRetainedRowContentScene({
          controlWidth: 40,
          id: "surface-a",
          ownerSectionId: "section-a",
          rowHeight: 28,
          rows: [
            {
              control: {
                commitPolicy: "native-island",
                defaultDisplayValue: "",
                displayValue: "value",
                editorKind: "text",
                kind: "text-like",
                policy: {
                  editorKind: "text",
                  language: null,
                  linePolicy: "single-line",
                  maxVisibleLines: 1,
                  minVisibleLines: 1,
                  wrapLines: false,
                },
                renderOwner: "dom-owned",
                rendererFamily: "text-like",
              },
              controlKind: "text-like",
              depth: 0,
              id: "param-a",
              label: "Param A",
              state: active
                ? {
                    domControlActivation: {
                      clientPoint: { x: 24, y: 12 },
                      kind: "pointer",
                    },
                    nativeControlActive: true,
                  }
                : undefined,
            },
          ],
          scrollOffset: { x: 0, y: 0 },
          viewportRect: { height: 28, width: 160, x: 0, y: 0 },
        }),
        zIndex: 0,
      },
    ],
  };
}
