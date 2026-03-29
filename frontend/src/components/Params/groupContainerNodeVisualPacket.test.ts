import { describe, expect, it } from "vitest";
import { buildLiveDictAreaNodeLayoutView } from "./groupContainerNodeLayoutView";
import { buildLiveDictAreaNodeVisualPacket } from "./groupContainerNodeVisualPacket";
import { buildLiveDictAreaSceneBlockView } from "./groupContainerSceneBlockView";
import { buildLiveDictAreaScenePacket } from "./groupContainerScenePackets";
import { buildLiveDictAreaSceneRendererPackets } from "./groupContainerSceneRendererPackets";

describe("buildLiveDictAreaNodeVisualPacket", () => {
  it("composes the ordered dict-area block visuals into a single node-level packet", () => {
    const rendererPackets = buildLiveDictAreaSceneRendererPackets({
      sceneBlockView: buildLiveDictAreaSceneBlockView({
        nodeLayoutView: buildLiveDictAreaNodeLayoutView({
          inputPortCount: 1,
          outputPortCount: 1,
          liveScenePacket: buildLiveDictAreaScenePacket({
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
            pinned: {
              requiredParamIdsToPaths: {
                "pinned-value": ["pinned-group", "pinned-value"],
              },
              topLevelParamIds: ["pinned-group"],
            },
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
          }),
        }),
      }),
    });

    const result = buildLiveDictAreaNodeVisualPacket({
      edgeStrip: {
        canConnect: true,
        inputPorts: [{ id: "input-a", label: "Input A" }],
        isSelectingParams: true,
        outputPorts: [{ id: "output-a", label: "Output A" }],
        selectedParamIds: ["input-a"],
      },
      rendererPackets,
    });

    expect(result.blocks.map((block) => block.blockId)).toEqual([
      "edges",
      "pinned",
      "unpinned",
    ]);
    expect(result.edgeStripBlock).toMatchObject({
      blockId: "edges",
      canConnect: true,
      inputColumn: {
        ports: [{ id: "input-a", isSelected: true, label: "Input A" }],
        title: "In",
      },
      outputColumn: {
        ports: [{ id: "output-a", label: "Output A" }],
        title: "Out",
      },
      shouldRoundBottom: false,
    });
    expect(result.pinnedParamAreaBlock).toMatchObject({
      blockId: "pinned",
      header: { icon: "pin", title: "Pinned Params" },
      list: {
        isSelectingParams: true,
        listKey: "pinned",
        selectedParamIds: ["input-a"],
        topLevelParamIds: ["pinned-group"],
      },
    });
    expect(result.unpinnedParamAreaBlock).toMatchObject({
      blockId: "unpinned",
      container: {
        minHeight: 48,
        shouldApplyMinHeight: true,
      },
      list: {
        isSelectingParams: true,
        listKey: "unpinned",
        selectedParamIds: ["input-a"],
        topLevelParamIds: ["unpinned-group"],
      },
    });
    expect(result.maxNestedDepth).toEqual(rendererPackets.maxNestedDepth);
  });

  it("omits the edge-strip visual block when the runtime edge ports are empty", () => {
    const result = buildLiveDictAreaNodeVisualPacket({
      edgeStrip: {
        canConnect: false,
        inputPorts: [],
        isSelectingParams: false,
        outputPorts: [],
        selectedParamIds: [],
      },
      rendererPackets: {
        blocks: [
          {
            blockId: "edges",
            estimatedHeight: 64,
            inputPortCount: 1,
            kind: "edge-strip",
            mount: {
              frameId: "dict-area-block:edges",
              mountKind: "fixed",
              orderIndex: 0,
              shouldMeasureAsFixed: true,
            },
            outputPortCount: 0,
            portRowCount: 1,
            title: "Edges",
          },
          {
            blockId: "pinned",
            grow: false,
            kind: "pinned-param-area",
            listKey: "pinned",
            maxNestedDepth: 1,
            minHeight: null,
            mount: {
              frameId: "dict-area-block:pinned",
              mountKind: "fixed",
              orderIndex: 1,
              shouldMeasureAsFixed: true,
            },
            requiredParamIdsToPaths: {
              leaf: ["leaf"],
            },
            rowCount: 1,
            rows: [{ depth: 0, id: "leaf", kind: "value", label: "Leaf" }],
            shouldApplyMinHeight: false,
            shouldRoundBottom: true,
            title: "Pinned Params",
            topLevelParamIds: ["leaf"],
          },
        ],
        edgeStripBlock: {
          blockId: "edges",
          estimatedHeight: 64,
          inputPortCount: 1,
          kind: "edge-strip",
          mount: {
            frameId: "dict-area-block:edges",
            mountKind: "fixed",
            orderIndex: 0,
            shouldMeasureAsFixed: true,
          },
          outputPortCount: 0,
          portRowCount: 1,
          title: "Edges",
        },
        maxNestedDepth: {
          pinned: 1,
          unpinned: 1,
        },
        pinnedParamAreaBlock: {
          blockId: "pinned",
          grow: false,
          kind: "pinned-param-area",
          listKey: "pinned",
          maxNestedDepth: 1,
          minHeight: null,
          mount: {
            frameId: "dict-area-block:pinned",
            mountKind: "fixed",
            orderIndex: 1,
            shouldMeasureAsFixed: true,
          },
          requiredParamIdsToPaths: {
            leaf: ["leaf"],
          },
          rowCount: 1,
          rows: [{ depth: 0, id: "leaf", kind: "value", label: "Leaf" }],
          shouldApplyMinHeight: false,
          shouldRoundBottom: true,
          title: "Pinned Params",
          topLevelParamIds: ["leaf"],
        },
        unpinnedParamAreaBlock: null,
      },
    });

    expect(result.edgeStripBlock).toBeNull();
    expect(result.blocks.map((block) => block.blockId)).toEqual(["pinned"]);
    expect(result.pinnedParamAreaBlock).not.toBeNull();
    expect(result.unpinnedParamAreaBlock).toBeNull();
  });
});
