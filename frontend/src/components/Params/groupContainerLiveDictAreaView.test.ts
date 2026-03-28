import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import { buildLiveDictAreaSurface } from "./groupContainerLiveDictAreaSurface";
import { buildLiveDictAreaView } from "./groupContainerLiveDictAreaView";

describe("buildLiveDictAreaView", () => {
  it("lifts the live dict-area surface into one higher-level view boundary", () => {
    const input = {
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
      handleColumnResizeStart: vi.fn(),
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
      sectionId: "section-1",
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
    };

    const expectedSurface = buildLiveDictAreaSurface(input);
    const result = buildLiveDictAreaView({ input });

    expect(result.liveDictAreaSurface).toEqual(expectedSurface);
    expect(result.maxNestedDepth).toEqual(expectedSurface.maxNestedDepth);
  });
});
