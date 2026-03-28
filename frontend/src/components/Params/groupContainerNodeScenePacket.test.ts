import { describe, expect, it } from "vitest";
import { buildLiveDictAreaNodeScenePacket } from "./groupContainerNodeScenePacket";

describe("buildLiveDictAreaNodeScenePacket", () => {
  it("composes the live dict-area scene and visual packets from one node-level boundary", () => {
    const result = buildLiveDictAreaNodeScenePacket({
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

    expect(result.edgeStrip).toMatchObject({
      canConnect: true,
      inputPortCount: 1,
      inputPorts: [{ id: "input-a", label: "Input A" }],
      isSelectingParams: true,
      outputPortCount: 1,
      outputPorts: [{ id: "output-a", label: "Output A" }],
      selectedParamIds: ["input-a"],
    });
    expect(result.scenePacket.paramAreas.map((paramArea) => paramArea.id)).toEqual(
      ["pinned", "unpinned"],
    );
    expect(
      result.scenePacket.paramAreas.map((paramArea) =>
        paramArea.rows.map((row) => row.kind),
      ),
    ).toEqual([["group", "value"], ["group", "value"]]);
    expect(result.visualPacket.blocks.map((block) => block.blockId)).toEqual([
      "edges",
      "pinned",
      "unpinned",
    ]);
    expect(result.visualPacket.maxNestedDepth).toEqual({
      pinned: 2,
      unpinned: 2,
    });
  });

  it("keeps the scene and visual packets aligned when edge ports and unpinned params are absent", () => {
    const result = buildLiveDictAreaNodeScenePacket({
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

    expect(result.edgeStrip.inputPortCount).toBe(0);
    expect(result.edgeStrip.outputPortCount).toBe(0);
    expect(result.scenePacket.paramAreas.map((paramArea) => paramArea.id)).toEqual([
      "pinned",
    ]);
    expect(result.visualPacket.edgeStripBlock).toBeNull();
    expect(result.visualPacket.blocks.map((block) => block.blockId)).toEqual([
      "pinned",
    ]);
  });
});
