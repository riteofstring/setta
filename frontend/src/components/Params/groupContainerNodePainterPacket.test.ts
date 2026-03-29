import { describe, expect, it } from "vitest";
import { SectionTypeEnum } from "utils/generatedTypes";
import { buildLiveDictAreaNodeDrawPacket } from "./groupContainerNodeDrawPacket";
import { buildLiveDictAreaNodePainterPacket } from "./groupContainerNodePainterPacket";
import { buildLiveDictAreaNodeScenePacket } from "./groupContainerNodeScenePacket";
import { buildLiveDictAreaNodeSurfacePacket } from "./groupContainerNodeSurfacePacket";

describe("buildLiveDictAreaNodePainterPacket", () => {
  it("lifts the node draw packet into stable painter packets for the live dict-area path", () => {
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

    const result = buildLiveDictAreaNodePainterPacket({
      nodeDrawPacket,
    });

    expect(result.edgeStrip).toEqual(nodeDrawPacket.edgeStrip);
    expect(result.scenePacket).toEqual(nodeDrawPacket.scenePacket);
    expect(result.maxNestedDepth).toEqual({
      pinned: 2,
      unpinned: 2,
    });
    expect(result.blocks.map((block) => block.kind)).toEqual([
      "edge-strip",
      "pinned-param-area",
      "unpinned-param-area",
    ]);
    expect(result.blocks.map((block) => block.mount.frameId)).toEqual([
      "dict-area-block:edges",
      "dict-area-block:pinned",
      "dict-area-block:unpinned",
    ]);
    expect(result.edgeStripBlock).toMatchObject({
      bgColor: "bg-surface",
      kind: "edge-strip",
      positionAndSizeLocked: false,
      styleColor: "amber",
    });
    expect(result.pinnedParamAreaBlock).toMatchObject({
      kind: "pinned-param-area",
      positionAndSizeLocked: false,
      sectionTypeName: SectionTypeEnum.Dict,
      styleColor: "amber",
    });
    expect(result.unpinnedParamAreaBlock).toMatchObject({
      kind: "unpinned-param-area",
      styleColor: "amber",
    });
  });

  it("keeps sparse painter packets sparse when only the pinned block survives", () => {
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

    const result = buildLiveDictAreaNodePainterPacket({
      nodeDrawPacket,
    });

    expect(result.edgeStripBlock).toBeNull();
    expect(result.unpinnedParamAreaBlock).toBeNull();
    expect(result.blocks.map((block) => block.kind)).toEqual([
      "pinned-param-area",
    ]);
  });
});
