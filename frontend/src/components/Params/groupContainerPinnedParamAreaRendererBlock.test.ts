import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import { buildLiveDictAreaBoundary } from "./groupContainerLiveDictAreaBoundary";
import { buildLiveDictAreaPinnedParamAreaRendererBlock } from "./groupContainerPinnedParamAreaRendererBlock";

describe("buildLiveDictAreaPinnedParamAreaRendererBlock", () => {
  it("lifts the pinned canary renderer into one explicit section-scoped render block", () => {
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

    if (!liveDictAreaBoundary.pinnedParamAreaBlock) {
      throw new Error("Expected pinned param-area canary renderer");
    }

    expect(
      buildLiveDictAreaPinnedParamAreaRendererBlock({
        canaryRenderer: liveDictAreaBoundary.pinnedParamAreaBlock,
        handleColumnResizeStart,
        sectionId: "section-1",
      }),
    ).toEqual({
      domPacket: liveDictAreaBoundary.pinnedParamAreaBlock.domPacket,
      handleColumnResizeStart,
      key: "dict-area-block:pinned",
      kind: "pinned-param-area",
      sectionId: "section-1",
    });
  });
});
