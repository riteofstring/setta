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
      sectionEdgePortsBySectionId: {
        "nested-a": {
          inputPortIds: [],
          outputPortIds: ["out-1"],
        },
      },
    });

    expect(cached).toEqual(initialLivePositions);

    const retained = collectCanvasEngineNestedDataHandlePositions({
      liveEdgeHandlePositions: {},
      knownTopLevelSectionIds: ["group-a"],
      nestedPreviewRects,
      sectionEdgePortsBySectionId: {
        "nested-a": {
          inputPortIds: [],
          outputPortIds: ["out-1"],
        },
      },
    });

    expect(retained).toEqual({
      "nested-a:out-1:source": createEdgeHandlePosition({
        sectionId: "nested-a",
        portId: "out-1",
        type: "source",
        x: 260,
        y: 150,
      }),
    });
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
      sectionEdgePortsBySectionId: {
        "nested-a": {
          inputPortIds: [],
          outputPortIds: ["out-1"],
        },
      },
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
      sectionEdgePortsBySectionId: {
        "nested-a": {
          inputPortIds: ["in-1"],
          outputPortIds: [],
        },
      },
    });

    expect(cached).toEqual({
      "nested-a:in-1:target": liveEdgeHandlePositions["nested-a:in-1:target"],
    });
  });

  it("estimates distinct cached positions from nested preview rects and port order", () => {
    const cached = collectCanvasEngineNestedDataHandlePositions({
      liveEdgeHandlePositions: {},
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
        createNestedPreviewRect({
          id: "nested-b",
          parentSectionId: "group-a",
          x: 40,
          y: 260,
          width: 220,
          height: 140,
        }),
      ],
      sectionEdgePortsBySectionId: {
        "nested-a": {
          inputPortIds: ["in-1", "in-2"],
          outputPortIds: ["out-1"],
        },
        "nested-b": {
          inputPortIds: ["in-1"],
          outputPortIds: ["out-1", "out-2"],
        },
      },
    });

    expect(cached).toEqual({
      "nested-a:in-1:target": createEdgeHandlePosition({
        sectionId: "nested-a",
        portId: "in-1",
        type: "target",
        x: 40,
        y: 126.66666666666666,
      }),
      "nested-a:in-2:target": createEdgeHandlePosition({
        sectionId: "nested-a",
        portId: "in-2",
        type: "target",
        x: 40,
        y: 173.33333333333331,
      }),
      "nested-a:out-1:source": createEdgeHandlePosition({
        sectionId: "nested-a",
        portId: "out-1",
        type: "source",
        x: 260,
        y: 150,
      }),
      "nested-b:in-1:target": createEdgeHandlePosition({
        sectionId: "nested-b",
        portId: "in-1",
        type: "target",
        x: 40,
        y: 330,
      }),
      "nested-b:out-1:source": createEdgeHandlePosition({
        sectionId: "nested-b",
        portId: "out-1",
        type: "source",
        x: 260,
        y: 306.6666666666667,
      }),
      "nested-b:out-2:source": createEdgeHandlePosition({
        sectionId: "nested-b",
        portId: "out-2",
        type: "source",
        x: 260,
        y: 353.3333333333333,
      }),
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
