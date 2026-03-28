import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { buildLiveDictAreaEdgeStripCanaryRenderer } from "./groupContainerEdgeStripCanaryRenderer";
import { buildLiveDictAreaNodeCanaryPacket } from "./groupContainerNodeCanaryPacket";
import { buildLiveDictAreaNodeCanaryRenderer } from "./groupContainerNodeCanaryRenderer";
import { buildLiveDictAreaNodeCanaryRenderView } from "./groupContainerNodeCanaryRenderView";
import { buildLiveDictAreaNodeCanaryView } from "./groupContainerNodeCanaryView";
import { buildLiveDictAreaPinnedParamAreaCanaryRenderer } from "./groupContainerPinnedParamAreaCanaryRenderer";
import { buildLiveDictAreaNodeScenePacket } from "./groupContainerNodeScenePacket";

describe("buildLiveDictAreaNodeCanaryRenderer", () => {
  it("composes the canary view and canary render view into one higher-level boundary", () => {
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

    const result = buildLiveDictAreaNodeCanaryRenderer({
      nodeCanaryPacket,
    });

    const canaryView = buildLiveDictAreaNodeCanaryView({
      nodeCanaryPacket,
    });
    const renderView = buildLiveDictAreaNodeCanaryRenderView({
      nodeCanaryView: canaryView,
    });
    const edgeStripRenderer = canaryView.edgeStripBlock
      ? buildLiveDictAreaEdgeStripCanaryRenderer({
          canaryView: canaryView.edgeStripBlock,
        })
      : null;
    const pinnedParamAreaRenderer = canaryView.pinnedParamAreaBlock
      ? buildLiveDictAreaPinnedParamAreaCanaryRenderer({
          canaryView: canaryView.pinnedParamAreaBlock,
        })
      : null;

    expect(result.canaryPacket).toEqual(nodeCanaryPacket);
    expect(result.canaryView).toEqual(canaryView);
    expect(result.blocks).toEqual([
      edgeStripRenderer,
      pinnedParamAreaRenderer,
      renderView.unpinnedParamAreaBlock,
    ]);
    expect(result.edgeStrip).toEqual(renderView.edgeStrip);
    expect(result.edgeStripBlock).toEqual(edgeStripRenderer);
    expect(result.pinnedParamAreaBlock).toEqual(pinnedParamAreaRenderer);
    expect(result.scenePacket).toEqual(renderView.scenePacket);
    expect(result.maxNestedDepth).toEqual({
      pinned: 2,
      unpinned: 2,
    });
    expect(result.edgeStripBlock?.canaryView).toEqual(canaryView.edgeStripBlock);
    expect(result.pinnedParamAreaBlock?.canaryView).toEqual(
      canaryView.pinnedParamAreaBlock,
    );
    expect(result.blocks.map((block) => block.key)).toEqual([
      "dict-area-block:edges",
      "dict-area-block:pinned",
      "dict-area-block:unpinned",
    ]);
  });

  it("keeps sparse renderer output sparse when only the pinned block survives", () => {
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

    const result = buildLiveDictAreaNodeCanaryRenderer({
      nodeCanaryPacket,
    });

    expect(result.edgeStripBlock).toBeNull();
    expect(result.unpinnedParamAreaBlock).toBeNull();
    expect(result.pinnedParamAreaBlock?.canaryView).toEqual(
      result.canaryView.pinnedParamAreaBlock,
    );
    expect(result.blocks.map((block) => block.blockId)).toEqual(["pinned"]);
    expect(result.canaryView.blocks.map((block) => block.blockId)).toEqual([
      "pinned",
    ]);
    expect(result.pinnedParamAreaBlock?.key).toBe("dict-area-block:pinned");
  });
});
