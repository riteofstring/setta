import { describe, expect, it } from "vitest";
import { buildLiveDictAreaNodeLayoutView } from "./groupContainerNodeLayoutView";
import { buildLiveDictAreaSceneBlockView } from "./groupContainerSceneBlockView";
import { buildLiveDictAreaScenePacket } from "./groupContainerScenePackets";
import { buildLiveDictAreaSceneRendererPackets } from "./groupContainerSceneRendererPackets";

describe("buildLiveDictAreaSceneRendererPackets", () => {
  it("flattens explicit dict-area scene blocks into scene renderer packets", () => {
    const sceneBlockView = buildLiveDictAreaSceneBlockView({
      nodeLayoutView: buildLiveDictAreaNodeLayoutView({
        inputPortCount: 1,
        outputPortCount: 2,
        liveScenePacket: buildLiveDictAreaScenePacket({
          edgeInputParams: [],
          hideUnpinnedParams: false,
          paramFilter: "",
          getParamDisplayName: (paramId: string) =>
            (
              ({
                "pinned-group": "Pinned Group",
                "pinned-leaf": "Pinned Value",
                "alpha-group": "Alpha Group",
                "alpha-leaf": "Alpha Value",
              }) as Record<string, string>
            )[paramId] ?? paramId,
          getParamValuePreview: () => null,
          pinned: {
            requiredParamIdsToPaths: {
              "pinned-leaf": ["pinned-group", "pinned-leaf"],
            },
            topLevelParamIds: ["pinned-group"],
          },
          unpinned: {
            canEditLayout: true,
            configuredMinHeight: 38,
            pinnedRequiredParamIdsToPaths: {
              "pinned-leaf": ["pinned-group", "pinned-leaf"],
            },
            pinnedTopLevelParamIds: ["pinned-group"],
            positionAndSizeLocked: false,
            requiredParamIdsToPaths: {
              "alpha-leaf": ["alpha-group", "alpha-leaf"],
            },
            topLevelParamIds: ["alpha-group"],
          },
        }),
      }),
    });

    expect(
      buildLiveDictAreaSceneRendererPackets({
        sceneBlockView,
      }),
    ).toEqual({
      blocks: [
        {
          blockId: "edges",
          estimatedHeight:
            sceneBlockView.edgeStripBlock?.framePacket.estimatedHeight,
          inputPortCount:
            sceneBlockView.edgeStripBlock?.framePacket.inputPortCount,
          kind: "edge-strip",
          mount: sceneBlockView.edgeStripBlock?.mount,
          outputPortCount:
            sceneBlockView.edgeStripBlock?.framePacket.outputPortCount,
          portRowCount: sceneBlockView.edgeStripBlock?.framePacket.portRowCount,
          title: "Edges",
        },
        {
          blockId: "pinned",
          grow: sceneBlockView.pinnedParamAreaBlock?.framePacket.grow,
          kind: "pinned-param-area",
          listKey: "pinned",
          maxNestedDepth:
            sceneBlockView.pinnedParamAreaBlock?.framePacket.maxNestedDepth,
          minHeight: sceneBlockView.pinnedParamAreaBlock?.framePacket.minHeight,
          mount: sceneBlockView.pinnedParamAreaBlock?.mount,
          requiredParamIdsToPaths:
            sceneBlockView.pinnedParamAreaBlock?.framePacket
              .requiredParamIdsToPaths,
          rowCount: sceneBlockView.pinnedParamAreaBlock?.framePacket.rowCount,
          rows: sceneBlockView.pinnedParamAreaBlock?.framePacket.rows,
          shouldApplyMinHeight:
            sceneBlockView.pinnedParamAreaBlock?.framePacket
              .shouldApplyMinHeight,
          shouldRoundBottom:
            sceneBlockView.pinnedParamAreaBlock?.framePacket.shouldRoundBottom,
          title: "Pinned Params",
          topLevelParamIds:
            sceneBlockView.pinnedParamAreaBlock?.framePacket.topLevelParamIds,
        },
        {
          blockId: "unpinned",
          grow: sceneBlockView.unpinnedParamAreaBlock?.framePacket.grow,
          kind: "unpinned-param-area",
          listKey: "unpinned",
          maxNestedDepth:
            sceneBlockView.unpinnedParamAreaBlock?.framePacket.maxNestedDepth,
          minHeight:
            sceneBlockView.unpinnedParamAreaBlock?.framePacket.minHeight,
          mount: sceneBlockView.unpinnedParamAreaBlock?.mount,
          requiredParamIdsToPaths:
            sceneBlockView.unpinnedParamAreaBlock?.framePacket
              .requiredParamIdsToPaths,
          rowCount: sceneBlockView.unpinnedParamAreaBlock?.framePacket.rowCount,
          rows: sceneBlockView.unpinnedParamAreaBlock?.framePacket.rows,
          shouldApplyMinHeight:
            sceneBlockView.unpinnedParamAreaBlock?.framePacket
              .shouldApplyMinHeight,
          shouldRoundBottom:
            sceneBlockView.unpinnedParamAreaBlock?.framePacket
              .shouldRoundBottom,
          title: "Params",
          topLevelParamIds:
            sceneBlockView.unpinnedParamAreaBlock?.framePacket.topLevelParamIds,
        },
      ],
      edgeStripBlock: {
        blockId: "edges",
        estimatedHeight:
          sceneBlockView.edgeStripBlock?.framePacket.estimatedHeight,
        inputPortCount:
          sceneBlockView.edgeStripBlock?.framePacket.inputPortCount,
        kind: "edge-strip",
        mount: sceneBlockView.edgeStripBlock?.mount,
        outputPortCount:
          sceneBlockView.edgeStripBlock?.framePacket.outputPortCount,
        portRowCount: sceneBlockView.edgeStripBlock?.framePacket.portRowCount,
        title: "Edges",
      },
      maxNestedDepth: sceneBlockView.maxNestedDepth,
      pinnedParamAreaBlock: {
        blockId: "pinned",
        grow: sceneBlockView.pinnedParamAreaBlock?.framePacket.grow,
        kind: "pinned-param-area",
        listKey: "pinned",
        maxNestedDepth:
          sceneBlockView.pinnedParamAreaBlock?.framePacket.maxNestedDepth,
        minHeight: sceneBlockView.pinnedParamAreaBlock?.framePacket.minHeight,
        mount: sceneBlockView.pinnedParamAreaBlock?.mount,
        requiredParamIdsToPaths:
          sceneBlockView.pinnedParamAreaBlock?.framePacket
            .requiredParamIdsToPaths,
        rowCount: sceneBlockView.pinnedParamAreaBlock?.framePacket.rowCount,
        rows: sceneBlockView.pinnedParamAreaBlock?.framePacket.rows,
        shouldApplyMinHeight:
          sceneBlockView.pinnedParamAreaBlock?.framePacket.shouldApplyMinHeight,
        shouldRoundBottom:
          sceneBlockView.pinnedParamAreaBlock?.framePacket.shouldRoundBottom,
        title: "Pinned Params",
        topLevelParamIds:
          sceneBlockView.pinnedParamAreaBlock?.framePacket.topLevelParamIds,
      },
      unpinnedParamAreaBlock: {
        blockId: "unpinned",
        grow: sceneBlockView.unpinnedParamAreaBlock?.framePacket.grow,
        kind: "unpinned-param-area",
        listKey: "unpinned",
        maxNestedDepth:
          sceneBlockView.unpinnedParamAreaBlock?.framePacket.maxNestedDepth,
        minHeight: sceneBlockView.unpinnedParamAreaBlock?.framePacket.minHeight,
        mount: sceneBlockView.unpinnedParamAreaBlock?.mount,
        requiredParamIdsToPaths:
          sceneBlockView.unpinnedParamAreaBlock?.framePacket
            .requiredParamIdsToPaths,
        rowCount: sceneBlockView.unpinnedParamAreaBlock?.framePacket.rowCount,
        rows: sceneBlockView.unpinnedParamAreaBlock?.framePacket.rows,
        shouldApplyMinHeight:
          sceneBlockView.unpinnedParamAreaBlock?.framePacket
            .shouldApplyMinHeight,
        shouldRoundBottom:
          sceneBlockView.unpinnedParamAreaBlock?.framePacket.shouldRoundBottom,
        title: "Params",
        topLevelParamIds:
          sceneBlockView.unpinnedParamAreaBlock?.framePacket.topLevelParamIds,
      },
    });
  });

  it("keeps sparse dict-area layouts sparse in the renderer packet view", () => {
    const sceneBlockView = buildLiveDictAreaSceneBlockView({
      nodeLayoutView: buildLiveDictAreaNodeLayoutView({
        inputPortCount: 0,
        outputPortCount: 0,
        liveScenePacket: buildLiveDictAreaScenePacket({
          edgeInputParams: [],
          hideUnpinnedParams: true,
          paramFilter: "",
          getParamDisplayName: (paramId: string) =>
            ({
              "pinned-value": "Pinned Value",
            })[paramId] ?? paramId,
          getParamValuePreview: () => null,
          pinned: {
            requiredParamIdsToPaths: {
              "pinned-value": ["pinned-value"],
            },
            topLevelParamIds: ["pinned-value"],
          },
          unpinned: {
            canEditLayout: true,
            configuredMinHeight: 24,
            pinnedRequiredParamIdsToPaths: {},
            pinnedTopLevelParamIds: [],
            positionAndSizeLocked: false,
            requiredParamIdsToPaths: {
              hidden: ["hidden"],
            },
            topLevelParamIds: ["hidden"],
          },
        }),
      }),
    });

    expect(
      buildLiveDictAreaSceneRendererPackets({
        sceneBlockView,
      }),
    ).toEqual({
      blocks: [
        {
          blockId: "pinned",
          grow: sceneBlockView.pinnedParamAreaBlock?.framePacket.grow,
          kind: "pinned-param-area",
          listKey: "pinned",
          maxNestedDepth:
            sceneBlockView.pinnedParamAreaBlock?.framePacket.maxNestedDepth,
          minHeight: sceneBlockView.pinnedParamAreaBlock?.framePacket.minHeight,
          mount: sceneBlockView.pinnedParamAreaBlock?.mount,
          requiredParamIdsToPaths:
            sceneBlockView.pinnedParamAreaBlock?.framePacket
              .requiredParamIdsToPaths,
          rowCount: sceneBlockView.pinnedParamAreaBlock?.framePacket.rowCount,
          rows: sceneBlockView.pinnedParamAreaBlock?.framePacket.rows,
          shouldApplyMinHeight:
            sceneBlockView.pinnedParamAreaBlock?.framePacket
              .shouldApplyMinHeight,
          shouldRoundBottom:
            sceneBlockView.pinnedParamAreaBlock?.framePacket.shouldRoundBottom,
          title: "Pinned Params",
          topLevelParamIds:
            sceneBlockView.pinnedParamAreaBlock?.framePacket.topLevelParamIds,
        },
      ],
      edgeStripBlock: null,
      maxNestedDepth: sceneBlockView.maxNestedDepth,
      pinnedParamAreaBlock: {
        blockId: "pinned",
        grow: sceneBlockView.pinnedParamAreaBlock?.framePacket.grow,
        kind: "pinned-param-area",
        listKey: "pinned",
        maxNestedDepth:
          sceneBlockView.pinnedParamAreaBlock?.framePacket.maxNestedDepth,
        minHeight: sceneBlockView.pinnedParamAreaBlock?.framePacket.minHeight,
        mount: sceneBlockView.pinnedParamAreaBlock?.mount,
        requiredParamIdsToPaths:
          sceneBlockView.pinnedParamAreaBlock?.framePacket
            .requiredParamIdsToPaths,
        rowCount: sceneBlockView.pinnedParamAreaBlock?.framePacket.rowCount,
        rows: sceneBlockView.pinnedParamAreaBlock?.framePacket.rows,
        shouldApplyMinHeight:
          sceneBlockView.pinnedParamAreaBlock?.framePacket.shouldApplyMinHeight,
        shouldRoundBottom:
          sceneBlockView.pinnedParamAreaBlock?.framePacket.shouldRoundBottom,
        title: "Pinned Params",
        topLevelParamIds:
          sceneBlockView.pinnedParamAreaBlock?.framePacket.topLevelParamIds,
      },
      unpinnedParamAreaBlock: null,
    });
  });
});
