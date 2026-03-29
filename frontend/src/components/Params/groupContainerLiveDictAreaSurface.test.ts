import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import { buildLiveDictAreaRenderBoundary } from "./groupContainerLiveDictAreaRenderBoundary";
import { buildLiveDictAreaSurface } from "./groupContainerLiveDictAreaSurface";

describe("buildLiveDictAreaSurface", () => {
  it("lifts the live dict-area render boundary into component-facing surface props", () => {
    const handleColumnResizeStart = vi.fn();
    const result = buildLiveDictAreaSurface({
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

    const expectedRenderBoundary = buildLiveDictAreaRenderBoundary({
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

    expect(result.liveDictAreaRenderBoundary).toEqual(expectedRenderBoundary);
    expect(result.blocks.map((block) => block.key)).toEqual([
      "dict-area-block:edges",
      "dict-area-block:pinned",
      "dict-area-block:unpinned",
    ]);
    expect(result.blocks.map((block) => block.props.sectionId)).toEqual([
      "section-1",
      "section-1",
      "section-1",
    ]);
    expect(result.blocks[0]).toEqual({
      key: "dict-area-block:edges",
      kind: "edge-strip",
      props: {
        domPacket: expectedRenderBoundary.blocks[0]?.domPacket,
        sectionId: "section-1",
      },
    });
    expect(result.blocks[1]).toEqual({
      key: "dict-area-block:pinned",
      kind: "pinned-param-area",
      props: {
        domPacket: expectedRenderBoundary.blocks[1]?.domPacket,
        handleColumnResizeStart,
        sectionId: "section-1",
      },
    });
    expect(result.blocks[2]).toEqual({
      key: "dict-area-block:unpinned",
      kind: "unpinned-param-area",
      props: {
        domPacket: expectedRenderBoundary.blocks[2]?.domPacket,
        handleColumnResizeStart,
        sectionId: "section-1",
      },
    });
  });

  it("keeps the higher-level surface sparse when only the pinned block survives", () => {
    const handleColumnResizeStart = vi.fn();
    const result = buildLiveDictAreaSurface({
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
    expect(result.blocks[0]).toEqual({
      key: "dict-area-block:pinned",
      kind: "pinned-param-area",
      props: {
        domPacket: result.liveDictAreaRenderBoundary.blocks[0]?.domPacket,
        handleColumnResizeStart,
        sectionId: "section-2",
      },
    });
  });
});
