import { describe, expect, it } from "vitest";
import { buildLiveDictAreaScenePacket } from "./groupContainerScenePackets";

describe("buildLiveDictAreaScenePacket", () => {
  it("builds pinned and unpinned live param-area packets in stable order", () => {
    expect(
      buildLiveDictAreaScenePacket({
        edgeInputParams: [],
        getParamEditorKind: (paramId: string) =>
          (
            ({
              "pinned-group": "other",
              "pinned-leaf": "combobox",
              "alpha-group": "other",
              "alpha-leaf": "codemirror",
              "beta-group": "other",
              "beta-leaf": "color-picker",
            }) as Record<
              string,
              "codemirror" | "combobox" | "color-picker" | "other"
            >
          )[paramId] ?? "other",
        hideUnpinnedParams: false,
        paramFilter: "",
        getParamDisplayName: (paramId: string) =>
          (
            ({
              "pinned-group": "Pinned Group",
              "pinned-leaf": "Pinned Value",
              "alpha-group": "Alpha Group",
              "alpha-leaf": "Alpha Value",
              "beta-group": "Beta Group",
              "beta-leaf": "Beta Value",
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
            "beta-leaf": ["beta-group", "beta-leaf"],
          },
          topLevelParamIds: ["alpha-group", "beta-group"],
        },
      }),
    ).toEqual({
      paramAreas: [
        {
          grow: false,
          id: "pinned",
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
              editorKind: "combobox",
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
          listKey: "unpinned",
          maxNestedDepth: 2,
          minHeight: 36,
          requiredParamIdsToPaths: {
            "alpha-leaf": ["alpha-group", "alpha-leaf"],
            "beta-leaf": ["beta-group", "beta-leaf"],
          },
          rowCount: 4,
          rows: [
            {
              depth: 0,
              id: "alpha-group",
              kind: "group",
              label: "Alpha Group",
            },
            {
              depth: 1,
              editorKind: "codemirror",
              id: "alpha-leaf",
              kind: "value",
              label: "Alpha Value",
            },
            {
              depth: 0,
              id: "beta-group",
              kind: "group",
              label: "Beta Group",
            },
            {
              depth: 1,
              editorKind: "color-picker",
              id: "beta-leaf",
              kind: "value",
              label: "Beta Value",
            },
          ],
          shouldApplyMinHeight: true,
          shouldRoundBottom: false,
          title: "Params",
          topLevelParamIds: ["alpha-group", "beta-group"],
        },
      ],
    });
  });

  it("omits hidden unpinned shells and empty pinned shells from the live packet", () => {
    expect(
      buildLiveDictAreaScenePacket({
        edgeInputParams: ["edge-param"],
        getParamEditorKind: () => "other",
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
      }).paramAreas,
    ).toEqual([]);
  });

  it("keeps live row filtering inside the unpinned shell packet", () => {
    expect(
      buildLiveDictAreaScenePacket({
        edgeInputParams: [],
        getParamEditorKind: (paramId: string) =>
          paramId === "beta-leaf" ? "combobox" : "other",
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
      }).paramAreas,
    ).toEqual([
      {
        grow: true,
        id: "unpinned",
        listKey: "unpinned",
        maxNestedDepth: 2,
        minHeight: 52,
        requiredParamIdsToPaths: {
          "alpha-leaf": ["alpha-group", "alpha-leaf"],
          "beta-leaf": ["beta-group", "beta-leaf"],
        },
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
            editorKind: "combobox",
            id: "beta-leaf",
            kind: "value",
            label: "Beta Value",
          },
        ],
        shouldApplyMinHeight: false,
        shouldRoundBottom: false,
        title: "Params",
        topLevelParamIds: ["alpha-group", "beta-group"],
      },
    ]);
  });
});
