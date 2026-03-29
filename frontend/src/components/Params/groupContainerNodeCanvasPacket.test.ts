import { describe, expect, it } from "vitest";
import { SectionTypeEnum } from "utils/generatedTypes";
import { buildLiveDictAreaNodeCanvasPacket } from "./groupContainerNodeCanvasPacket";
import { buildLiveDictAreaNodeDrawPacket } from "./groupContainerNodeDrawPacket";
import { buildLiveDictAreaNodeScenePacket } from "./groupContainerNodeScenePacket";
import { buildLiveDictAreaNodeSurfacePacket } from "./groupContainerNodeSurfacePacket";

describe("buildLiveDictAreaNodeCanvasPacket", () => {
  it("lifts the node painter boundary into one scene-plus-dom canvas packet", () => {
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
    const nodeSurfacePacket = buildLiveDictAreaNodeSurfacePacket({
      bgColor: "bg-surface",
      nodeScenePacket,
      positionAndSizeLocked: false,
      sectionTypeName: SectionTypeEnum.Dict,
      styleColor: "amber",
    });
    const nodeDrawPacket = buildLiveDictAreaNodeDrawPacket({
      nodeSurfacePacket,
    });

    const result = buildLiveDictAreaNodeCanvasPacket({
      nodeDrawPacket,
    });

    expect(result.edgeStrip).toEqual(nodeDrawPacket.edgeStrip);
    expect(result.scenePacket).toEqual(nodeDrawPacket.scenePacket);
    expect(result.maxNestedDepth).toEqual({
      pinned: 2,
      unpinned: 2,
    });
    expect(result.domBlocks.map((block) => block.kind)).toEqual([
      "edge-strip",
      "pinned-param-area",
      "unpinned-param-area",
    ]);
    expect(result.domBlocks.map((block) => block.mount.frameId)).toEqual([
      "dict-area-block:edges",
      "dict-area-block:pinned",
      "dict-area-block:unpinned",
    ]);
    expect(result.domEdgeStripBlock).toMatchObject({
      bgColor: "bg-surface",
      kind: "edge-strip",
      positionAndSizeLocked: false,
      styleColor: "amber",
    });
    expect(result.domPinnedParamAreaBlock).toMatchObject({
      kind: "pinned-param-area",
      positionAndSizeLocked: false,
      sectionTypeName: SectionTypeEnum.Dict,
      styleColor: "amber",
    });
    expect(result.domUnpinnedParamAreaBlock).toMatchObject({
      kind: "unpinned-param-area",
      styleColor: "amber",
    });
  });

  it("keeps sparse canvas packets sparse when only the pinned dom block survives", () => {
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
    const nodeSurfacePacket = buildLiveDictAreaNodeSurfacePacket({
      bgColor: "bg-surface",
      nodeScenePacket,
      positionAndSizeLocked: true,
      sectionTypeName: SectionTypeEnum.Dict,
      styleColor: null,
    });
    const nodeDrawPacket = buildLiveDictAreaNodeDrawPacket({
      nodeSurfacePacket,
    });

    const result = buildLiveDictAreaNodeCanvasPacket({
      nodeDrawPacket,
    });

    expect(result.domEdgeStripBlock).toBeNull();
    expect(result.domUnpinnedParamAreaBlock).toBeNull();
    expect(result.domBlocks.map((block) => block.kind)).toEqual([
      "pinned-param-area",
    ]);
  });
});
