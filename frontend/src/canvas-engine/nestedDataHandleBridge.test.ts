import { describe, expect, it } from "vitest";
import { collectCanvasEngineNestedDataHandlePositions } from "./nestedDataHandleBridge";
import type { CanvasEngineEdgeHandlePosition } from "./sceneAdapter";
import type { CanvasEngineNestedPreviewRect } from "./types";

describe("collectCanvasEngineNestedDataHandlePositions", () => {
  it("retains measured nested positions after live handles disappear", () => {
    const nestedPreviewRects: CanvasEngineNestedPreviewRect[] = [
      createNestedPreviewRect({
        id: "nested-a",
        parentSectionId: "group-a",
        x: 40,
        y: 80,
        width: 220,
        height: 140,
      }),
    ];
    const initialLivePositions = {
      "nested-a:out-1:source": createEdgeHandlePosition({
        sectionId: "nested-a",
        portId: "out-1",
        type: "source",
        x: 260,
        y: 150,
      }),
    };

    const cached = collectCanvasEngineNestedDataHandlePositions({
      liveEdgeHandlePositions: initialLivePositions,
      knownTopLevelSectionIds: ["group-a"],
      nestedPreviewRects,
      previousCachedPositions: {},
    });

    expect(cached).toEqual(initialLivePositions);

    const retained = collectCanvasEngineNestedDataHandlePositions({
      liveEdgeHandlePositions: {},
      knownTopLevelSectionIds: ["group-a"],
      nestedPreviewRects,
      previousCachedPositions: cached,
    });

    expect(retained).toEqual(initialLivePositions);
  });

  it("drops cached positions when the nested preview section disappears", () => {
    const previousCachedPositions = {
      "nested-a:out-1:source": createEdgeHandlePosition({
        sectionId: "nested-a",
        portId: "out-1",
        type: "source",
        x: 260,
        y: 150,
      }),
    };

    const nextCached = collectCanvasEngineNestedDataHandlePositions({
      liveEdgeHandlePositions: {},
      knownTopLevelSectionIds: ["group-a"],
      nestedPreviewRects: [],
      previousCachedPositions,
    });

    expect(nextCached).toEqual({});
  });

  it("never caches top-level handle positions", () => {
    const liveEdgeHandlePositions = {
      "group-a:out-1:source": createEdgeHandlePosition({
        sectionId: "group-a",
        portId: "out-1",
        type: "source",
        x: 320,
        y: 180,
      }),
      "nested-a:in-1:target": createEdgeHandlePosition({
        sectionId: "nested-a",
        portId: "in-1",
        type: "target",
        x: 180,
        y: 140,
      }),
    };

    const cached = collectCanvasEngineNestedDataHandlePositions({
      liveEdgeHandlePositions,
      knownTopLevelSectionIds: ["group-a"],
      nestedPreviewRects: [
        createNestedPreviewRect({
          id: "nested-a",
          parentSectionId: "group-a",
          x: 40,
          y: 80,
          width: 220,
          height: 140,
        }),
      ],
      previousCachedPositions: {},
    });

    expect(cached).toEqual({
      "nested-a:in-1:target": liveEdgeHandlePositions["nested-a:in-1:target"],
    });
  });
});

function createNestedPreviewRect({
  id,
  parentSectionId,
  x,
  y,
  width,
  height,
}: {
  id: string;
  parentSectionId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}): CanvasEngineNestedPreviewRect {
  return {
    id,
    parentSectionId,
    x,
    y,
    width,
    height,
    isActive: false,
    color: [0.15, 0.18, 0.22],
  };
}

function createEdgeHandlePosition({
  sectionId,
  portId,
  type,
  x,
  y,
}: {
  sectionId: string;
  portId: string;
  type: "source" | "target";
  x: number;
  y: number;
}): CanvasEngineEdgeHandlePosition {
  return {
    sectionId,
    portId,
    type,
    x,
    y,
  };
}
