import { describe, expect, it } from "vitest";
import type { DictAreaNodeLayoutPacket } from "../Section/Layouts/dictAreaNodeLayoutPackets";
import { buildLiveDictAreaBlockFramePackets } from "./groupContainerBlockFramePackets";
import type { LiveDictAreaNodeLayoutParamAreaView } from "./groupContainerNodeLayoutView";

describe("buildLiveDictAreaBlockFramePackets", () => {
  it("builds ordered fixed and grow mount packets from the node-layout blocks", () => {
    const pinnedLayoutBlock = {
      grow: false,
      id: "pinned",
      kind: "param-area" as const,
      minHeight: null,
      rowCount: 1,
      rows: [
        {
          depth: 0,
          id: "pinned-group",
          kind: "group",
          label: "Pinned Group",
        },
      ],
      shouldApplyMinHeight: false,
      title: "Pinned Params",
    };
    const unpinnedLayoutBlock = {
      grow: true,
      id: "unpinned",
      kind: "param-area" as const,
      minHeight: 36,
      rowCount: 1,
      rows: [
        {
          depth: 0,
          id: "alpha-value",
          kind: "value",
          label: "Alpha Value",
        },
      ],
      shouldApplyMinHeight: true,
      title: "Params",
    };
    const nodeLayoutPacket: DictAreaNodeLayoutPacket = {
      blocks: [
        {
          estimatedHeight: 28,
          grow: false,
          id: "edges",
          inputPortCount: 1,
          kind: "edge-strip",
          outputPortCount: 0,
          portRowCount: 1,
          title: "Edges",
        },
        pinnedLayoutBlock,
        unpinnedLayoutBlock,
      ],
      fixedBlockIds: ["edges", "pinned"],
      growBlockIds: ["unpinned"],
      totalMinHeight: 64,
      totalVisibleParamRowCount: 2,
    };
    const paramAreas: LiveDictAreaNodeLayoutParamAreaView[] = [
      {
        grow: false,
        id: "pinned",
        layoutBlock: pinnedLayoutBlock,
        listKey: "pinned",
        maxNestedDepth: 1,
        minHeight: null,
        requiredParamIdsToPaths: {
          "pinned-group": ["pinned-group"],
        },
        rowCount: 1,
        rows: pinnedLayoutBlock.rows,
        shouldApplyMinHeight: false,
        shouldRoundBottom: false,
        title: "Pinned Params",
        topLevelParamIds: ["pinned-group"],
      },
      {
        grow: true,
        id: "unpinned",
        layoutBlock: unpinnedLayoutBlock,
        listKey: "unpinned",
        maxNestedDepth: 1,
        minHeight: 36,
        requiredParamIdsToPaths: {
          "alpha-value": ["alpha-value"],
        },
        rowCount: 1,
        rows: unpinnedLayoutBlock.rows,
        shouldApplyMinHeight: true,
        shouldRoundBottom: false,
        title: "Params",
        topLevelParamIds: ["alpha-value"],
      },
    ];

    expect(
      buildLiveDictAreaBlockFramePackets({
        nodeLayoutPacket,
        paramAreas,
      }),
    ).toEqual({
      blockFrames: [
        {
          estimatedHeight: 28,
          frame: {
            frameId: "dict-area-block:edges",
            mountKind: "fixed",
            orderIndex: 0,
            shouldMeasureAsFixed: true,
          },
          grow: false,
          id: "edges",
          inputPortCount: 1,
          kind: "edge-strip",
          outputPortCount: 0,
          portRowCount: 1,
          title: "Edges",
        },
        {
          frame: {
            frameId: "dict-area-block:pinned",
            mountKind: "fixed",
            orderIndex: 1,
            shouldMeasureAsFixed: true,
          },
          grow: false,
          id: "pinned",
          kind: "param-area",
          layoutBlock: pinnedLayoutBlock,
          listKey: "pinned",
          maxNestedDepth: 1,
          minHeight: null,
          requiredParamIdsToPaths: {
            "pinned-group": ["pinned-group"],
          },
          rowCount: 1,
          rows: pinnedLayoutBlock.rows,
          shouldApplyMinHeight: false,
          shouldRoundBottom: false,
          title: "Pinned Params",
          topLevelParamIds: ["pinned-group"],
        },
        {
          frame: {
            frameId: "dict-area-block:unpinned",
            mountKind: "grow",
            orderIndex: 2,
            shouldMeasureAsFixed: false,
          },
          grow: true,
          id: "unpinned",
          kind: "param-area",
          layoutBlock: unpinnedLayoutBlock,
          listKey: "unpinned",
          maxNestedDepth: 1,
          minHeight: 36,
          requiredParamIdsToPaths: {
            "alpha-value": ["alpha-value"],
          },
          rowCount: 1,
          rows: unpinnedLayoutBlock.rows,
          shouldApplyMinHeight: true,
          shouldRoundBottom: false,
          title: "Params",
          topLevelParamIds: ["alpha-value"],
        },
      ],
      edgeStripFrame: {
        estimatedHeight: 28,
        frame: {
          frameId: "dict-area-block:edges",
          mountKind: "fixed",
          orderIndex: 0,
          shouldMeasureAsFixed: true,
        },
        grow: false,
        id: "edges",
        inputPortCount: 1,
        kind: "edge-strip",
        outputPortCount: 0,
        portRowCount: 1,
        title: "Edges",
      },
      pinnedParamAreaFrame: {
        frame: {
          frameId: "dict-area-block:pinned",
          mountKind: "fixed",
          orderIndex: 1,
          shouldMeasureAsFixed: true,
        },
        grow: false,
        id: "pinned",
        kind: "param-area",
        layoutBlock: pinnedLayoutBlock,
        listKey: "pinned",
        maxNestedDepth: 1,
        minHeight: null,
        requiredParamIdsToPaths: {
          "pinned-group": ["pinned-group"],
        },
        rowCount: 1,
        rows: pinnedLayoutBlock.rows,
        shouldApplyMinHeight: false,
        shouldRoundBottom: false,
        title: "Pinned Params",
        topLevelParamIds: ["pinned-group"],
      },
      unpinnedParamAreaFrame: {
        frame: {
          frameId: "dict-area-block:unpinned",
          mountKind: "grow",
          orderIndex: 2,
          shouldMeasureAsFixed: false,
        },
        grow: true,
        id: "unpinned",
        kind: "param-area",
        layoutBlock: unpinnedLayoutBlock,
        listKey: "unpinned",
        maxNestedDepth: 1,
        minHeight: 36,
        requiredParamIdsToPaths: {
          "alpha-value": ["alpha-value"],
        },
        rowCount: 1,
        rows: unpinnedLayoutBlock.rows,
        shouldApplyMinHeight: true,
        shouldRoundBottom: false,
        title: "Params",
        topLevelParamIds: ["alpha-value"],
      },
    });
  });

  it("keeps edge frames when param-area blocks have no matching live view", () => {
    const nodeLayoutPacket: DictAreaNodeLayoutPacket = {
      blocks: [
        {
          estimatedHeight: 20,
          grow: false,
          id: "edges",
          inputPortCount: 0,
          kind: "edge-strip",
          outputPortCount: 1,
          portRowCount: 1,
          title: "Edges",
        },
        {
          grow: true,
          id: "unpinned",
          kind: "param-area",
          minHeight: null,
          rowCount: 1,
          rows: [],
          shouldApplyMinHeight: true,
          title: "Params",
        },
      ],
      fixedBlockIds: ["edges"],
      growBlockIds: ["unpinned"],
      totalMinHeight: 20,
      totalVisibleParamRowCount: 0,
    };

    expect(
      buildLiveDictAreaBlockFramePackets({
        nodeLayoutPacket,
        paramAreas: [],
      }),
    ).toEqual({
      blockFrames: [
        {
          estimatedHeight: 20,
          frame: {
            frameId: "dict-area-block:edges",
            mountKind: "fixed",
            orderIndex: 0,
            shouldMeasureAsFixed: true,
          },
          grow: false,
          id: "edges",
          inputPortCount: 0,
          kind: "edge-strip",
          outputPortCount: 1,
          portRowCount: 1,
          title: "Edges",
        },
      ],
      edgeStripFrame: {
        estimatedHeight: 20,
        frame: {
          frameId: "dict-area-block:edges",
          mountKind: "fixed",
          orderIndex: 0,
          shouldMeasureAsFixed: true,
        },
        grow: false,
        id: "edges",
        inputPortCount: 0,
        kind: "edge-strip",
        outputPortCount: 1,
        portRowCount: 1,
        title: "Edges",
      },
      pinnedParamAreaFrame: null,
      unpinnedParamAreaFrame: null,
    });
  });
});
