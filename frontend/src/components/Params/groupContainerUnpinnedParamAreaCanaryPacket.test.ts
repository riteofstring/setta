import { describe, expect, it } from "vitest";
import { buildLiveDictAreaUnpinnedParamAreaCanaryPacket } from "./groupContainerUnpinnedParamAreaCanaryPacket";

describe("buildLiveDictAreaUnpinnedParamAreaCanaryPacket", () => {
  it("pairs the live DOM unpinned block with its scene packet", () => {
    expect(
      buildLiveDictAreaUnpinnedParamAreaCanaryPacket({
        domPacket: {
          blockId: "dict-area-block:unpinned",
          kind: "unpinned-param-area",
          mount: {
            blockId: "dict-area-block:unpinned",
            frameId: "dict-area-block:unpinned",
            kind: "grow",
            orderIndex: 2,
          },
          styleColor: "amber",
          visualPacket: {
            container: {
              minHeight: 48,
              shouldApplyMinHeight: true,
            },
            list: {
              listKey: "unpinned",
              requiredParamIdsToPaths: {
                leaf: ["group", "leaf"],
              },
              topLevelParamIds: ["group"],
            },
            mount: {
              blockId: "dict-area-block:unpinned",
              frameId: "dict-area-block:unpinned",
              kind: "grow",
              orderIndex: 2,
            },
          },
        },
        scenePacket: {
          grow: true,
          id: "unpinned",
          listKey: "unpinned",
          maxNestedDepth: 2,
          minHeight: 48,
          requiredParamIdsToPaths: {
            leaf: ["group", "leaf"],
          },
          rowCount: 2,
          rows: [
            {
              depth: 0,
              id: "group",
              kind: "group",
              label: "Group",
            },
            {
              depth: 1,
              id: "leaf",
              kind: "value",
              label: "Leaf",
            },
          ],
          shouldApplyMinHeight: true,
          shouldRoundBottom: false,
          title: "Params",
          topLevelParamIds: ["group"],
        },
      }),
    ).toEqual({
      blockId: "dict-area-block:unpinned",
      domPacket: {
        blockId: "dict-area-block:unpinned",
        kind: "unpinned-param-area",
        mount: {
          blockId: "dict-area-block:unpinned",
          frameId: "dict-area-block:unpinned",
          kind: "grow",
          orderIndex: 2,
        },
        styleColor: "amber",
        visualPacket: {
          container: {
            minHeight: 48,
            shouldApplyMinHeight: true,
          },
          list: {
            listKey: "unpinned",
            requiredParamIdsToPaths: {
              leaf: ["group", "leaf"],
            },
            topLevelParamIds: ["group"],
          },
          mount: {
            blockId: "dict-area-block:unpinned",
            frameId: "dict-area-block:unpinned",
            kind: "grow",
            orderIndex: 2,
          },
        },
      },
      kind: "unpinned-param-area",
      scenePacket: {
        grow: true,
        id: "unpinned",
        listKey: "unpinned",
        maxNestedDepth: 2,
        minHeight: 48,
        requiredParamIdsToPaths: {
          leaf: ["group", "leaf"],
        },
        rowCount: 2,
        rows: [
          {
            depth: 0,
            id: "group",
            kind: "group",
            label: "Group",
          },
          {
            depth: 1,
            id: "leaf",
            kind: "value",
            label: "Leaf",
          },
        ],
        shouldApplyMinHeight: true,
        shouldRoundBottom: false,
        title: "Params",
        topLevelParamIds: ["group"],
      },
    });
  });
});
