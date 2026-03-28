import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import { buildLiveDictAreaBoundary } from "./groupContainerLiveDictAreaBoundary";
import { buildLiveDictAreaRenderBoundary } from "./groupContainerLiveDictAreaRenderBoundary";
import { buildLiveDictAreaSceneBoundary } from "./groupContainerLiveDictAreaSceneBoundary";
import { buildLiveDictAreaSurface } from "./groupContainerLiveDictAreaSurface";
import { buildLiveDictAreaView } from "./groupContainerLiveDictAreaView";

describe("buildLiveDictAreaView", () => {
  it("lifts the live dict-area surface and scene packets into one higher-level view boundary", () => {
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

    const expectedBoundary = buildLiveDictAreaBoundary({
      bgColor: input.bgColor,
      canConnect: input.canConnect,
      edgeInputParams: input.edgeInputParams,
      getParamDisplayName: input.getParamDisplayName,
      hideUnpinnedParams: input.hideUnpinnedParams,
      inputPorts: input.inputPorts,
      isSelectingParams: input.isSelectingParams,
      outputPorts: input.outputPorts,
      paramFilter: input.paramFilter,
      pinned: input.pinned,
      positionAndSizeLocked: input.positionAndSizeLocked,
      sectionTypeName: input.sectionTypeName,
      selectedParamIds: input.selectedParamIds,
      styleColor: input.styleColor,
      unpinned: input.unpinned,
    });
    const expectedRenderBoundary = buildLiveDictAreaRenderBoundary(input);
    const expectedSceneBoundary = buildLiveDictAreaSceneBoundary({
      liveDictAreaBoundary: expectedBoundary,
    });
    const expectedSurface = buildLiveDictAreaSurface(input);
    const result = buildLiveDictAreaView({ input });

    expect(result.liveDictAreaBoundary).toEqual(expectedBoundary);
    expect(result.liveDictAreaRenderBoundary).toEqual(expectedRenderBoundary);
    expect(result.liveDictAreaSceneBoundary).toEqual(expectedSceneBoundary);
    expect(result.liveDictAreaSurface).toEqual(expectedSurface);
    expect(result.maxNestedDepth).toEqual(expectedSurface.maxNestedDepth);
    expect(result.liveDictAreaRenderBoundary.liveDictAreaBoundary).toBe(
      result.liveDictAreaBoundary,
    );
    expect(result.liveDictAreaSceneBoundary.liveDictAreaBoundary).toBe(
      result.liveDictAreaBoundary,
    );
  });
});
