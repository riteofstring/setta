import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import { buildLiveDictAreaBoundary } from "./groupContainerLiveDictAreaBoundary";
import { buildLiveDictAreaUnpinnedParamAreaRendererBlock } from "./groupContainerUnpinnedParamAreaRendererBlock";

describe("buildLiveDictAreaUnpinnedParamAreaRendererBlock", () => {
  it("lifts the unpinned canary renderer into one explicit section-scoped render block", () => {
    const handleColumnResizeStart = vi.fn();
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

    if (!liveDictAreaBoundary.unpinnedParamAreaBlock) {
      throw new Error("Expected unpinned param-area canary renderer");
    }

    expect(
      buildLiveDictAreaUnpinnedParamAreaRendererBlock({
        canaryRenderer: liveDictAreaBoundary.unpinnedParamAreaBlock,
        handleColumnResizeStart,
        sectionId: "section-1",
      }),
    ).toEqual({
      domPacket: liveDictAreaBoundary.unpinnedParamAreaBlock.domPacket,
      handleColumnResizeStart,
      key: "dict-area-block:unpinned",
      kind: "unpinned-param-area",
      sectionId: "section-1",
    });
  });
});
