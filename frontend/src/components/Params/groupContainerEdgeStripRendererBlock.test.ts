import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { buildLiveDictAreaBoundary } from "./groupContainerLiveDictAreaBoundary";
import { buildLiveDictAreaEdgeStripRendererBlock } from "./groupContainerEdgeStripRendererBlock";

describe("buildLiveDictAreaEdgeStripRendererBlock", () => {
  it("lifts the edge-strip canary renderer into one explicit section-scoped render block", () => {
    const liveDictAreaBoundary = buildLiveDictAreaBoundary({
      bgColor: "bg-surface",
      canConnect: true,
      edgeInputParams: [],
      getParamDisplayName: (paramId: string) =>
        (
          ({
            "pinned-group": "Pinned Group",
            "pinned-value": "Pinned Value",
            "unpinned-group": "Unpinned Group",
            "unpinned-value": "Unpinned Value",
          }) as Record<string, string>
        )[paramId] ?? paramId,
      hideUnpinnedParams: false,
      inputPorts: [{ id: "input-a", label: "Input A" }],
      isSelectingParams: true,
      outputPorts: [{ id: "output-a", label: "Output A" }],
      paramFilter: "",
      pinned: {
        requiredParamIdsToPaths: {
          "pinned-value": ["pinned-group", "pinned-value"],
        },
        topLevelParamIds: ["pinned-group"],
      },
      positionAndSizeLocked: false,
      sectionTypeName: SectionTypeEnum.Dict,
      selectedParamIds: ["input-a"],
      styleColor: "amber",
      unpinned: {
        canEditLayout: true,
        configuredMinHeight: 48,
        pinnedRequiredParamIdsToPaths: {
          "pinned-value": ["pinned-group", "pinned-value"],
        },
        pinnedTopLevelParamIds: ["pinned-group"],
        positionAndSizeLocked: false,
        requiredParamIdsToPaths: {
          "unpinned-value": ["unpinned-group", "unpinned-value"],
        },
        topLevelParamIds: ["unpinned-group"],
      },
    });

    if (!liveDictAreaBoundary.edgeStripBlock) {
      throw new Error("Expected edge-strip canary renderer");
    }

    expect(
      buildLiveDictAreaEdgeStripRendererBlock({
        canaryRenderer: liveDictAreaBoundary.edgeStripBlock,
        sectionId: "section-1",
      }),
    ).toEqual({
      domPacket: liveDictAreaBoundary.edgeStripBlock.domPacket,
      key: "dict-area-block:edges",
      kind: "edge-strip",
      sectionId: "section-1",
    });
  });
});
