import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { buildLiveDictAreaNodeCanaryPacket } from "./groupContainerNodeCanaryPacket";
import { buildLiveDictAreaNodeScenePacket } from "./groupContainerNodeScenePacket";

describe("buildLiveDictAreaNodeCanaryPacket", () => {
  it("pairs each live DOM block with its matching scene-owned canary packet", () => {
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

    const result = buildLiveDictAreaNodeCanaryPacket({
      bgColor: "bg-surface",
      nodeScenePacket,
      positionAndSizeLocked: false,
      sectionTypeName: SectionTypeEnum.Dict,
      styleColor: "amber",
    });

    expect(result.edgeStrip).toEqual(nodeScenePacket.edgeStrip);
    expect(result.scenePacket).toEqual(nodeScenePacket.scenePacket);
    expect(result.maxNestedDepth).toEqual({
      pinned: 2,
      unpinned: 2,
    });
    expect(result.blocks.map((block) => block.kind)).toEqual([
      "edge-strip",
      "pinned-param-area",
      "unpinned-param-area",
    ]);
    expect(result.edgeStripBlock).toMatchObject({
      blockId: "edges",
      kind: "edge-strip",
      scenePacket: {
        inputPortCount: 1,
        outputPortCount: 1,
      },
    });
    expect(result.pinnedParamAreaBlock).toMatchObject({
      blockId: "pinned",
      kind: "pinned-param-area",
      scenePacket: {
        id: "pinned",
        rowCount: 2,
        title: "Pinned Params",
      },
    });
    expect(result.unpinnedParamAreaBlock).toMatchObject({
      blockId: "unpinned",
      kind: "unpinned-param-area",
      scenePacket: {
        id: "unpinned",
        rowCount: 2,
        title: "Params",
      },
    });
  });

  it("keeps the canary packet sparse when only the pinned DOM block survives", () => {
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

    const result = buildLiveDictAreaNodeCanaryPacket({
      bgColor: "bg-surface",
      nodeScenePacket,
      positionAndSizeLocked: true,
      sectionTypeName: SectionTypeEnum.Dict,
      styleColor: null,
    });

    expect(result.edgeStripBlock).toBeNull();
    expect(result.unpinnedParamAreaBlock).toBeNull();
    expect(result.blocks.map((block) => block.kind)).toEqual([
      "pinned-param-area",
    ]);
    expect(result.pinnedParamAreaBlock?.scenePacket.id).toBe("pinned");
  });
});
