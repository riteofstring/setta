import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { buildLiveDictAreaNodeCanaryPacket } from "./groupContainerNodeCanaryPacket";
import { buildLiveDictAreaNodeCanaryRenderView } from "./groupContainerNodeCanaryRenderView";
import { buildLiveDictAreaNodeCanaryView } from "./groupContainerNodeCanaryView";
import { buildLiveDictAreaNodeScenePacket } from "./groupContainerNodeScenePacket";

describe("buildLiveDictAreaNodeCanaryRenderView", () => {
  it("composes the block-specific canary views into one higher-level render boundary", () => {
    const nodeScenePacket = buildLiveDictAreaNodeScenePacket({
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
      selectedParamIds: ["input-a"],
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
    const nodeCanaryPacket = buildLiveDictAreaNodeCanaryPacket({
      bgColor: "bg-surface",
      nodeScenePacket,
      positionAndSizeLocked: false,
      sectionTypeName: SectionTypeEnum.Dict,
      styleColor: "amber",
    });
    const nodeCanaryView = buildLiveDictAreaNodeCanaryView({
      nodeCanaryPacket,
    });

    const result = buildLiveDictAreaNodeCanaryRenderView({
      nodeCanaryView,
    });

    expect(result.edgeStrip).toEqual(nodeCanaryView.edgeStrip);
    expect(result.scenePacket).toEqual(nodeCanaryView.scenePacket);
    expect(result.maxNestedDepth).toEqual({
      pinned: 2,
      unpinned: 2,
    });
    expect(result.blocks.map((block) => block.blockId)).toEqual([
      "edges",
      "pinned",
      "unpinned",
    ]);
    expect(result.blocks.map((block) => block.key)).toEqual([
      "dict-area-block:edges",
      "dict-area-block:pinned",
      "dict-area-block:unpinned",
    ]);
    expect(result.edgeStripBlock?.key).toBe("dict-area-block:edges");
    expect(result.pinnedParamAreaBlock?.key).toBe("dict-area-block:pinned");
    expect(result.unpinnedParamAreaBlock?.key).toBe("dict-area-block:unpinned");
  });

  it("keeps sparse render views sparse when only the pinned block survives", () => {
    const nodeScenePacket = buildLiveDictAreaNodeScenePacket({
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
      selectedParamIds: [],
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
    const nodeCanaryPacket = buildLiveDictAreaNodeCanaryPacket({
      bgColor: "bg-surface",
      nodeScenePacket,
      positionAndSizeLocked: true,
      sectionTypeName: SectionTypeEnum.Dict,
      styleColor: null,
    });
    const nodeCanaryView = buildLiveDictAreaNodeCanaryView({
      nodeCanaryPacket,
    });

    const result = buildLiveDictAreaNodeCanaryRenderView({
      nodeCanaryView,
    });

    expect(result.edgeStripBlock).toBeNull();
    expect(result.unpinnedParamAreaBlock).toBeNull();
    expect(result.blocks.map((block) => block.blockId)).toEqual(["pinned"]);
    expect(result.pinnedParamAreaBlock?.key).toBe("dict-area-block:pinned");
  });
});
