import { describe, expect, it } from "vitest";
import { getEdgeStripEstimatedHeight } from "./edgeStripUtils";
import { buildLiveDictAreaNodeLayoutView } from "./groupContainerNodeLayoutView";
import { buildLiveDictAreaScenePacket } from "./groupContainerScenePackets";

describe("buildLiveDictAreaNodeLayoutView", () => {
  it("routes the live dict-area scene packet through ordered layout blocks", () => {
    const liveScenePacket = buildLiveDictAreaScenePacket({
      edgeInputParams: [],
      hideUnpinnedParams: false,
      paramFilter: "",
      getParamDisplayName: (paramId: string) =>
        (
          {
            "pinned-group": "Pinned Group",
            "pinned-leaf": "Pinned Value",
            "alpha-group": "Alpha Group",
            "alpha-leaf": "Alpha Value",
          } as Record<string, string>
        )[paramId] ?? paramId,
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
    });

    expect(
      buildLiveDictAreaNodeLayoutView({
        inputPortCount: 1,
        outputPortCount: 2,
        liveScenePacket,
      }),
    ).toEqual({
      nodeLayoutPacket: {
        blocks: [
          {
            estimatedHeight: getEdgeStripEstimatedHeight(1, 2),
            grow: false,
            id: "edges",
            inputPortCount: 1,
            kind: "edge-strip",
            outputPortCount: 2,
            portRowCount: 2,
            title: "Edges",
          },
          {
            grow: false,
            id: "pinned",
            kind: "param-area",
            minHeight: null,
            rowCount: 2,
            rows: [
              {
                depth: 0,
                id: "pinned-group",
                kind: "group",
                label: "Pinned Group",
              },
              {
                depth: 1,
                id: "pinned-leaf",
                kind: "value",
                label: "Pinned Value",
              },
            ],
            shouldApplyMinHeight: false,
            title: "Pinned Params",
          },
          {
            grow: true,
            id: "unpinned",
            kind: "param-area",
            minHeight: 36,
            rowCount: 2,
            rows: [
              {
                depth: 0,
                id: "alpha-group",
                kind: "group",
                label: "Alpha Group",
              },
              {
                depth: 1,
                id: "alpha-leaf",
                kind: "value",
                label: "Alpha Value",
              },
            ],
            shouldApplyMinHeight: true,
            title: "Params",
          },
        ],
        fixedBlockIds: ["edges", "pinned"],
        growBlockIds: ["unpinned"],
        totalMinHeight: getEdgeStripEstimatedHeight(1, 2) + 36,
        totalVisibleParamRowCount: 4,
      },
      paramAreas: [
        {
          grow: false,
          id: "pinned",
          layoutBlock: {
            grow: false,
            id: "pinned",
            kind: "param-area",
            minHeight: null,
            rowCount: 2,
            rows: [
              {
                depth: 0,
                id: "pinned-group",
                kind: "group",
                label: "Pinned Group",
              },
              {
                depth: 1,
                id: "pinned-leaf",
                kind: "value",
                label: "Pinned Value",
              },
            ],
            shouldApplyMinHeight: false,
            title: "Pinned Params",
          },
          listKey: "pinned",
          maxNestedDepth: 2,
          minHeight: null,
          requiredParamIdsToPaths: {
            "pinned-leaf": ["pinned-group", "pinned-leaf"],
          },
          rowCount: 2,
          rows: [
            {
              depth: 0,
              id: "pinned-group",
              kind: "group",
              label: "Pinned Group",
            },
            {
              depth: 1,
              id: "pinned-leaf",
              kind: "value",
              label: "Pinned Value",
            },
          ],
          shouldApplyMinHeight: false,
          shouldRoundBottom: false,
          title: "Pinned Params",
          topLevelParamIds: ["pinned-group"],
        },
        {
          grow: true,
          id: "unpinned",
          layoutBlock: {
            grow: true,
            id: "unpinned",
            kind: "param-area",
            minHeight: 36,
            rowCount: 2,
            rows: [
              {
                depth: 0,
                id: "alpha-group",
                kind: "group",
                label: "Alpha Group",
              },
              {
                depth: 1,
                id: "alpha-leaf",
                kind: "value",
                label: "Alpha Value",
              },
            ],
            shouldApplyMinHeight: true,
            title: "Params",
          },
          listKey: "unpinned",
          maxNestedDepth: 2,
          minHeight: 36,
          requiredParamIdsToPaths: {
            "alpha-leaf": ["alpha-group", "alpha-leaf"],
          },
          rowCount: 2,
          rows: [
            {
              depth: 0,
              id: "alpha-group",
              kind: "group",
              label: "Alpha Group",
            },
            {
              depth: 1,
              id: "alpha-leaf",
              kind: "value",
              label: "Alpha Value",
            },
          ],
          shouldApplyMinHeight: true,
          shouldRoundBottom: false,
          title: "Params",
          topLevelParamIds: ["alpha-group"],
        },
      ],
      pinnedParamArea: {
        grow: false,
        id: "pinned",
        layoutBlock: {
          grow: false,
          id: "pinned",
          kind: "param-area",
          minHeight: null,
          rowCount: 2,
          rows: [
            {
              depth: 0,
              id: "pinned-group",
              kind: "group",
              label: "Pinned Group",
            },
            {
              depth: 1,
              id: "pinned-leaf",
              kind: "value",
              label: "Pinned Value",
            },
          ],
          shouldApplyMinHeight: false,
          title: "Pinned Params",
        },
        listKey: "pinned",
        maxNestedDepth: 2,
        minHeight: null,
        requiredParamIdsToPaths: {
          "pinned-leaf": ["pinned-group", "pinned-leaf"],
        },
        rowCount: 2,
        rows: [
          {
            depth: 0,
            id: "pinned-group",
            kind: "group",
            label: "Pinned Group",
          },
          {
            depth: 1,
            id: "pinned-leaf",
            kind: "value",
            label: "Pinned Value",
          },
        ],
        shouldApplyMinHeight: false,
        shouldRoundBottom: false,
        title: "Pinned Params",
        topLevelParamIds: ["pinned-group"],
      },
      unpinnedParamArea: {
        grow: true,
        id: "unpinned",
        layoutBlock: {
          grow: true,
          id: "unpinned",
          kind: "param-area",
          minHeight: 36,
          rowCount: 2,
          rows: [
            {
              depth: 0,
              id: "alpha-group",
              kind: "group",
              label: "Alpha Group",
            },
            {
              depth: 1,
              id: "alpha-leaf",
              kind: "value",
              label: "Alpha Value",
            },
          ],
          shouldApplyMinHeight: true,
          title: "Params",
        },
        listKey: "unpinned",
        maxNestedDepth: 2,
        minHeight: 36,
        requiredParamIdsToPaths: {
          "alpha-leaf": ["alpha-group", "alpha-leaf"],
        },
        rowCount: 2,
        rows: [
          {
            depth: 0,
            id: "alpha-group",
            kind: "group",
            label: "Alpha Group",
          },
          {
            depth: 1,
            id: "alpha-leaf",
            kind: "value",
            label: "Alpha Value",
          },
        ],
        shouldApplyMinHeight: true,
        shouldRoundBottom: false,
        title: "Params",
        topLevelParamIds: ["alpha-group"],
      },
    });
  });

  it("drops scene param areas that do not survive the layout packet", () => {
    const liveScenePacket = buildLiveDictAreaScenePacket({
      edgeInputParams: ["edge-param"],
      hideUnpinnedParams: true,
      paramFilter: "",
      getParamDisplayName: () => "ignored",
      pinned: {
        requiredParamIdsToPaths: {
          "edge-param": ["edge-param"],
        },
        topLevelParamIds: ["edge-param"],
      },
      unpinned: {
        canEditLayout: true,
        configuredMinHeight: 36,
        pinnedRequiredParamIdsToPaths: {},
        pinnedTopLevelParamIds: [],
        positionAndSizeLocked: false,
        requiredParamIdsToPaths: {
          alpha: ["alpha"],
        },
        topLevelParamIds: ["alpha"],
      },
    });

    expect(
      buildLiveDictAreaNodeLayoutView({
        inputPortCount: 1,
        outputPortCount: 0,
        liveScenePacket,
      }),
    ).toEqual({
      nodeLayoutPacket: {
        blocks: [
          {
            estimatedHeight: getEdgeStripEstimatedHeight(1, 0),
            grow: false,
            id: "edges",
            inputPortCount: 1,
            kind: "edge-strip",
            outputPortCount: 0,
            portRowCount: 1,
            title: "Edges",
          },
        ],
        fixedBlockIds: ["edges"],
        growBlockIds: [],
        totalMinHeight: getEdgeStripEstimatedHeight(1, 0),
        totalVisibleParamRowCount: 0,
      },
      paramAreas: [],
      pinnedParamArea: null,
      unpinnedParamArea: null,
    });
  });
});
