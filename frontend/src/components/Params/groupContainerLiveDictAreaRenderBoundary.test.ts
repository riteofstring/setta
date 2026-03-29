import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import { buildLiveDictAreaBoundary } from "./groupContainerLiveDictAreaBoundary";
import {
  buildLiveDictAreaRenderBoundary,
  buildLiveDictAreaRenderBoundaryFromBoundary,
} from "./groupContainerLiveDictAreaRenderBoundary";

describe("buildLiveDictAreaRenderBoundary", () => {
  it("composes the live dict-area boundary and renderer through one higher-level helper", () => {
    const handleColumnResizeStart = vi.fn();
    const result = buildLiveDictAreaRenderBoundary({
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
      handleColumnResizeStart,
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
    });

    const expectedBoundary = buildLiveDictAreaBoundary({
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

    expect(result.liveDictAreaBoundary).toEqual(expectedBoundary);
    expect(result.blocks.map((block) => block.key)).toEqual([
      "dict-area-block:edges",
      "dict-area-block:pinned",
      "dict-area-block:unpinned",
    ]);
    expect(result.blocks.map((block) => block.sectionId)).toEqual([
      "section-1",
      "section-1",
      "section-1",
    ]);
    expect(result.maxNestedDepth).toEqual({ pinned: 2, unpinned: 2 });
  });

  it("reuses the supplied live dict-area boundary when the caller already lifted it", () => {
    const handleColumnResizeStart = vi.fn();
    const liveDictAreaBoundary = buildLiveDictAreaBoundary({
      bgColor: "bg-surface",
      canConnect: true,
      edgeInputParams: [],
      getParamDisplayName: (paramId: string) =>
        ({ leaf: "Leaf" })[paramId] ?? paramId,
      hideUnpinnedParams: false,
      inputPorts: [],
      isSelectingParams: false,
      outputPorts: [],
      paramFilter: "",
      pinned: {
        requiredParamIdsToPaths: {
          leaf: ["leaf"],
        },
        topLevelParamIds: ["leaf"],
      },
      positionAndSizeLocked: false,
      sectionTypeName: SectionTypeEnum.Dict,
      selectedParamIds: [],
      styleColor: "amber",
      unpinned: {
        canEditLayout: true,
        configuredMinHeight: 48,
        pinnedRequiredParamIdsToPaths: {
          leaf: ["leaf"],
        },
        pinnedTopLevelParamIds: ["leaf"],
        positionAndSizeLocked: false,
        requiredParamIdsToPaths: {
          other: ["other"],
        },
        topLevelParamIds: ["other"],
      },
    });

    const result = buildLiveDictAreaRenderBoundaryFromBoundary({
      handleColumnResizeStart,
      liveDictAreaBoundary,
      sectionId: "section-3",
    });

    expect(result.liveDictAreaBoundary).toBe(liveDictAreaBoundary);
    expect(result.blocks.map((block) => block.sectionId)).toEqual([
      "section-3",
      "section-3",
    ]);
    expect(result.maxNestedDepth).toEqual({ pinned: 1, unpinned: 1 });
  });

  it("keeps the higher-level render boundary sparse when only the pinned block survives", () => {
    const handleColumnResizeStart = vi.fn();
    const result = buildLiveDictAreaRenderBoundary({
      bgColor: "bg-surface",
      canConnect: false,
      edgeInputParams: [],
      getParamDisplayName: (paramId: string) =>
        ({ leaf: "Leaf" })[paramId] ?? paramId,
      handleColumnResizeStart,
      hideUnpinnedParams: true,
      inputPorts: [],
      isSelectingParams: false,
      outputPorts: [],
      paramFilter: "",
      pinned: {
        requiredParamIdsToPaths: {
          leaf: ["leaf"],
        },
        topLevelParamIds: ["leaf"],
      },
      positionAndSizeLocked: true,
      sectionId: "section-2",
      sectionTypeName: SectionTypeEnum.Dict,
      selectedParamIds: [],
      styleColor: null,
      unpinned: {
        canEditLayout: true,
        configuredMinHeight: 80,
        pinnedRequiredParamIdsToPaths: {
          leaf: ["leaf"],
        },
        pinnedTopLevelParamIds: ["leaf"],
        positionAndSizeLocked: false,
        requiredParamIdsToPaths: {
          hidden: ["hidden"],
        },
        topLevelParamIds: ["hidden"],
      },
    });

    expect(result.edgeStripBlock).toBeNull();
    expect(result.unpinnedParamAreaBlock).toBeNull();
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]?.kind).toBe("pinned-param-area");
    if (result.blocks[0]?.kind !== "pinned-param-area") {
      throw new Error("Expected pinned renderer block");
    }
    expect(result.blocks[0].sectionId).toBe("section-2");
    expect(result.blocks[0].handleColumnResizeStart).toBe(
      handleColumnResizeStart,
    );
  });
});
