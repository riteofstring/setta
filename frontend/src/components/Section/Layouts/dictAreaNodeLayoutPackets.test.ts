import { describe, expect, it } from "vitest";
import { getEdgeStripEstimatedHeight } from "../../Params/edgeStripUtils";
import { buildLiveDictAreaScenePacket } from "../../Params/groupContainerScenePackets";
import { buildDictAreaNodeLayoutPacket } from "./dictAreaNodeLayoutPackets";

describe("buildDictAreaNodeLayoutPacket", () => {
  it("lifts the live dict-area packet into ordered fixed and grow layout blocks", () => {
    const liveScenePacket = buildLiveDictAreaScenePacket({
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
      buildDictAreaNodeLayoutPacket({
        inputPortCount: 1,
        outputPortCount: 2,
        paramAreas: liveScenePacket.paramAreas,
      }),
    ).toEqual({
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
    });
  });

  it("omits empty edge blocks and ignores suppressed param-area min heights", () => {
    const liveScenePacket = buildLiveDictAreaScenePacket({
      edgeInputParams: [],
      hideUnpinnedParams: false,
      paramFilter: "beta",
      getParamDisplayName: (paramId: string) =>
        (
          ({
            "alpha-group": "Alpha Group",
            "alpha-leaf": "Alpha Value",
            "beta-group": "Beta Group",
            "beta-leaf": "Beta Value",
          }) as Record<string, string>
        )[paramId] ?? paramId,
      pinned: {
        requiredParamIdsToPaths: {},
        topLevelParamIds: [],
      },
      unpinned: {
        canEditLayout: false,
        configuredMinHeight: 52,
        pinnedRequiredParamIdsToPaths: {},
        pinnedTopLevelParamIds: [],
        positionAndSizeLocked: false,
        requiredParamIdsToPaths: {
          "alpha-leaf": ["alpha-group", "alpha-leaf"],
          "beta-leaf": ["beta-group", "beta-leaf"],
        },
        topLevelParamIds: ["alpha-group", "beta-group"],
      },
    });

    expect(
      buildDictAreaNodeLayoutPacket({
        inputPortCount: 0,
        outputPortCount: 0,
        paramAreas: liveScenePacket.paramAreas,
      }),
    ).toEqual({
      blocks: [
        {
          grow: true,
          id: "unpinned",
          kind: "param-area",
          minHeight: 52,
          rowCount: 2,
          rows: [
            {
              depth: 0,
              id: "beta-group",
              kind: "group",
              label: "Beta Group",
            },
            {
              depth: 1,
              id: "beta-leaf",
              kind: "value",
              label: "Beta Value",
            },
          ],
          shouldApplyMinHeight: false,
          title: "Params",
        },
      ],
      fixedBlockIds: [],
      growBlockIds: ["unpinned"],
      totalMinHeight: 0,
      totalVisibleParamRowCount: 2,
    });
  });

  it("normalizes invalid min heights while preserving placeholder rows", () => {
    expect(
      buildDictAreaNodeLayoutPacket({
        inputPortCount: 0,
        outputPortCount: 1,
        paramAreas: [
          {
            grow: true,
            id: "unpinned",
            minHeight: Number.NaN,
            rowCount: 1,
            rows: [
              {
                depth: 0,
                id: "__temp__placeholder",
                kind: "placeholder",
                label: null,
              },
            ],
            shouldApplyMinHeight: true,
            title: "Params",
          },
        ],
      }),
    ).toEqual({
      blocks: [
        {
          estimatedHeight: getEdgeStripEstimatedHeight(0, 1),
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
          rows: [
            {
              depth: 0,
              id: "__temp__placeholder",
              kind: "placeholder",
              label: null,
            },
          ],
          shouldApplyMinHeight: true,
          title: "Params",
        },
      ],
      fixedBlockIds: ["edges"],
      growBlockIds: ["unpinned"],
      totalMinHeight: getEdgeStripEstimatedHeight(0, 1),
      totalVisibleParamRowCount: 1,
    });
  });
});
