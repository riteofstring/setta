import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import { buildLiveDictAreaBoundary } from "./groupContainerLiveDictAreaBoundary";
import { buildLiveDictAreaRenderer } from "./groupContainerLiveDictAreaRenderer";

describe("buildLiveDictAreaRenderer", () => {
  it("lifts the live dict-area boundary into renderer blocks with section props", () => {
    const handleColumnResizeStart = vi.fn();
    const liveDictAreaBoundary = buildLiveDictAreaBoundary({
      bgColor: "bg-surface",
      canConnect: true,
      edgeInputParams: [],
      hideUnpinnedParams: false,
      paramFilter: "",
      getParamDisplayName: (paramId: string) =>
        (
          ({
            "pinned-group": "Pinned Group",
            "pinned-value": "Pinned Value",
            "unpinned-group": "Unpinned Group",
            "unpinned-value": "Unpinned Value",
          }) as Record<string, string>
        )[paramId] ?? paramId,
      inputPorts: [{ id: "input-a", label: "Input A" }],
      isSelectingParams: true,
      outputPorts: [{ id: "output-a", label: "Output A" }],
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

    const result = buildLiveDictAreaRenderer({
      handleColumnResizeStart,
      liveDictAreaBoundary,
      sectionId: "section-1",
    });

    expect(result.nodeScenePacket).toEqual(liveDictAreaBoundary.nodeScenePacket);
    expect(result.canaryPacket).toEqual(liveDictAreaBoundary.canaryPacket);
    expect(result.canaryView).toEqual(liveDictAreaBoundary.canaryView);
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

    const pinnedBlock = result.blocks.find(
      (block) => block.kind === "pinned-param-area",
    );
    const unpinnedBlock = result.blocks.find(
      (block) => block.kind === "unpinned-param-area",
    );

    expect(pinnedBlock?.handleColumnResizeStart).toBe(handleColumnResizeStart);
    expect(unpinnedBlock?.handleColumnResizeStart).toBe(
      handleColumnResizeStart,
    );
  });

  it("keeps the higher-level renderer sparse when only the pinned block survives", () => {
    const handleColumnResizeStart = vi.fn();
    const liveDictAreaBoundary = buildLiveDictAreaBoundary({
      bgColor: "bg-surface",
      canConnect: false,
      edgeInputParams: [],
      hideUnpinnedParams: true,
      paramFilter: "",
      getParamDisplayName: (paramId: string) =>
        ({ leaf: "Leaf" })[paramId] ?? paramId,
      inputPorts: [],
      isSelectingParams: false,
      outputPorts: [],
      pinned: {
        requiredParamIdsToPaths: {
          leaf: ["leaf"],
        },
        topLevelParamIds: ["leaf"],
      },
      positionAndSizeLocked: true,
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

    const result = buildLiveDictAreaRenderer({
      handleColumnResizeStart,
      liveDictAreaBoundary,
      sectionId: "section-2",
    });

    expect(result.edgeStripBlock).toBeNull();
    expect(result.unpinnedParamAreaBlock).toBeNull();
    expect(result.blocks).toHaveLength(1);
    expect(result.blocks[0]?.domPacket.blockId).toBe("pinned");
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
