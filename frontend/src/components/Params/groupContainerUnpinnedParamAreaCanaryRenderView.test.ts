import { describe, expect, it } from "vitest";
import { buildLiveDictAreaUnpinnedParamAreaCanaryRenderView } from "./groupContainerUnpinnedParamAreaCanaryRenderView";

describe("buildLiveDictAreaUnpinnedParamAreaCanaryRenderView", () => {
  it("lifts the live unpinned param-area canary view into one explicit render block", () => {
    // The render helper should preserve the canary view payload while surfacing
    // the stable frame-id key used by the higher-level render boundary.
    expect(
      buildLiveDictAreaUnpinnedParamAreaCanaryRenderView({
        canaryView: {
          blockId: "unpinned",
          domPacket: {
            blockId: "unpinned",
            kind: "unpinned-param-area",
            mount: {
              frameId: "dict-area-block:unpinned",
              mountKind: "grow",
              orderIndex: 2,
              shouldMeasureAsFixed: false,
            },
            paramArea: {
              canEditLayout: true,
              id: "unpinned",
              kind: "param-area",
              maxNestedDepth: 2,
              minHeight: 64,
              rows: [
                {
                  depth: 0,
                  id: "group",
                  kind: "group",
                  label: "Unpinned Group",
                },
                {
                  depth: 1,
                  id: "leaf",
                  kind: "value",
                  label: "Unpinned Value",
                },
              ],
              shouldRoundBottom: false,
            },
          },
          kind: "unpinned-param-area",
          mount: {
            frameId: "dict-area-block:unpinned",
            mountKind: "grow",
            orderIndex: 2,
            shouldMeasureAsFixed: false,
          },
          scenePacket: {
            grow: true,
            id: "unpinned",
            listKey: "unpinned",
            maxNestedDepth: 2,
            minHeight: 64,
            rowCount: 2,
            rows: [
              {
                depth: 0,
                id: "group",
                kind: "group",
                label: "Unpinned Group",
              },
              {
                depth: 1,
                id: "leaf",
                kind: "value",
                label: "Unpinned Value",
              },
            ],
            shouldApplyMinHeight: true,
            shouldRoundBottom: false,
            title: "Params",
            topLevelParamIds: ["group"],
          },
        },
      }),
    ).toEqual({
      blockId: "unpinned",
      domPacket: {
        blockId: "unpinned",
        kind: "unpinned-param-area",
        mount: {
          frameId: "dict-area-block:unpinned",
          mountKind: "grow",
          orderIndex: 2,
          shouldMeasureAsFixed: false,
        },
        paramArea: {
          canEditLayout: true,
          id: "unpinned",
          kind: "param-area",
          maxNestedDepth: 2,
          minHeight: 64,
          rows: [
            {
              depth: 0,
              id: "group",
              kind: "group",
              label: "Unpinned Group",
            },
            {
              depth: 1,
              id: "leaf",
              kind: "value",
              label: "Unpinned Value",
            },
          ],
          shouldRoundBottom: false,
        },
      },
      key: "dict-area-block:unpinned",
      kind: "unpinned-param-area",
      mount: {
        frameId: "dict-area-block:unpinned",
        mountKind: "grow",
        orderIndex: 2,
        shouldMeasureAsFixed: false,
      },
      scenePacket: {
        grow: true,
        id: "unpinned",
        listKey: "unpinned",
        maxNestedDepth: 2,
        minHeight: 64,
        rowCount: 2,
        rows: [
          {
            depth: 0,
            id: "group",
            kind: "group",
            label: "Unpinned Group",
          },
          {
            depth: 1,
            id: "leaf",
            kind: "value",
            label: "Unpinned Value",
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
