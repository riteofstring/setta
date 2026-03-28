import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { buildLiveDictAreaBoundary } from "./groupContainerLiveDictAreaBoundary";
import { buildLiveDictAreaSceneBoundary } from "./groupContainerLiveDictAreaSceneBoundary";
import { buildLiveDictAreaNodeLayoutView } from "./groupContainerNodeLayoutView";
import { buildLiveDictAreaSceneBlockView } from "./groupContainerSceneBlockView";
import { buildLiveDictAreaSceneRendererPackets } from "./groupContainerSceneRendererPackets";

describe("buildLiveDictAreaSceneBoundary", () => {
  it("lifts the live dict-area canary boundary into explicit scene renderer packets", () => {
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

    const result = buildLiveDictAreaSceneBoundary({
      liveDictAreaBoundary,
    });
    const nodeLayoutView = buildLiveDictAreaNodeLayoutView({
      inputPortCount:
        liveDictAreaBoundary.nodeScenePacket.edgeStrip.inputPortCount,
      outputPortCount:
        liveDictAreaBoundary.nodeScenePacket.edgeStrip.outputPortCount,
      liveScenePacket: liveDictAreaBoundary.nodeScenePacket.scenePacket,
    });
    const sceneBlockView = buildLiveDictAreaSceneBlockView({
      nodeLayoutView,
    });
    const sceneRendererPackets = buildLiveDictAreaSceneRendererPackets({
      sceneBlockView,
    });

    expect(result.liveDictAreaBoundary).toEqual(liveDictAreaBoundary);
    expect(result.nodeLayoutView).toEqual(nodeLayoutView);
    expect(result.sceneBlockView).toEqual(sceneBlockView);
    expect(result.blocks).toEqual(sceneRendererPackets.blocks);
    expect(result.edgeStripBlock).toEqual(sceneRendererPackets.edgeStripBlock);
    expect(result.pinnedParamAreaBlock).toEqual(
      sceneRendererPackets.pinnedParamAreaBlock,
    );
    expect(result.unpinnedParamAreaBlock).toEqual(
      sceneRendererPackets.unpinnedParamAreaBlock,
    );
    expect(result.maxNestedDepth).toEqual({ pinned: 2, unpinned: 2 });
  });

  it("keeps sparse scene boundaries sparse when only the pinned block survives", () => {
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

    const result = buildLiveDictAreaSceneBoundary({
      liveDictAreaBoundary,
    });

    expect(result.edgeStripBlock).toBeNull();
    expect(result.unpinnedParamAreaBlock).toBeNull();
    expect(result.blocks.map((block) => block.blockId)).toEqual(["pinned"]);
    expect(result.sceneBlockView.blocks.map((block) => block.blockId)).toEqual([
      "pinned",
    ]);
  });
});
