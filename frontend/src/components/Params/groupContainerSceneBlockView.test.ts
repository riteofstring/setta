import { describe, expect, it } from "vitest";
import { buildLiveDictAreaNodeLayoutView } from "./groupContainerNodeLayoutView";
import { buildLiveDictAreaSceneBlockView } from "./groupContainerSceneBlockView";
import { buildLiveDictAreaScenePacket } from "./groupContainerScenePackets";

describe("buildLiveDictAreaSceneBlockView", () => {
  it("normalizes ordered dict-area block frames into explicit scene block kinds", () => {
    const nodeLayoutView = buildLiveDictAreaNodeLayoutView({
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
    });
    const edgeStripFrame = nodeLayoutView.edgeStripFrame;
    const pinnedParamAreaFrame = nodeLayoutView.pinnedParamAreaFrame;
    const unpinnedParamAreaFrame = nodeLayoutView.unpinnedParamAreaFrame;

    if (!edgeStripFrame || !pinnedParamAreaFrame || !unpinnedParamAreaFrame) {
      throw new Error("expected edge, pinned, and unpinned block frames");
    }

    expect(
      buildLiveDictAreaSceneBlockView({
        nodeLayoutView,
      }),
    ).toEqual({
      blocks: [
        {
          blockId: "edges",
          framePacket: edgeStripFrame,
          kind: "edge-strip",
          mount: edgeStripFrame.frame,
        },
        {
          blockId: "pinned",
          framePacket: pinnedParamAreaFrame,
          kind: "pinned-param-area",
          mount: pinnedParamAreaFrame.frame,
        },
        {
          blockId: "unpinned",
          framePacket: unpinnedParamAreaFrame,
          kind: "unpinned-param-area",
          mount: unpinnedParamAreaFrame.frame,
        },
      ],
      edgeStripBlock: {
        blockId: "edges",
        framePacket: edgeStripFrame,
        kind: "edge-strip",
        mount: edgeStripFrame.frame,
      },
      maxNestedDepth: {
        pinned: pinnedParamAreaFrame.maxNestedDepth,
        unpinned: unpinnedParamAreaFrame.maxNestedDepth,
      },
      pinnedParamAreaBlock: {
        blockId: "pinned",
        framePacket: pinnedParamAreaFrame,
        kind: "pinned-param-area",
        mount: pinnedParamAreaFrame.frame,
      },
      unpinnedParamAreaBlock: {
        blockId: "unpinned",
        framePacket: unpinnedParamAreaFrame,
        kind: "unpinned-param-area",
        mount: unpinnedParamAreaFrame.frame,
      },
    });
  });

  it("handles missing edge and unpinned blocks without inventing extra scene surfaces", () => {
    const nodeLayoutView = buildLiveDictAreaNodeLayoutView({
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
    });
    const pinnedParamAreaFrame = nodeLayoutView.pinnedParamAreaFrame;

    if (!pinnedParamAreaFrame) {
      throw new Error("expected a pinned param-area frame");
    }

    expect(
      buildLiveDictAreaSceneBlockView({
        nodeLayoutView,
      }),
    ).toEqual({
      blocks: [
        {
          blockId: "pinned",
          framePacket: pinnedParamAreaFrame,
          kind: "pinned-param-area",
          mount: pinnedParamAreaFrame.frame,
        },
      ],
      edgeStripBlock: null,
      maxNestedDepth: {
        pinned: pinnedParamAreaFrame.maxNestedDepth,
        unpinned: 0,
      },
      pinnedParamAreaBlock: {
        blockId: "pinned",
        framePacket: pinnedParamAreaFrame,
        kind: "pinned-param-area",
        mount: pinnedParamAreaFrame.frame,
      },
      unpinnedParamAreaBlock: null,
    });
  });
});
