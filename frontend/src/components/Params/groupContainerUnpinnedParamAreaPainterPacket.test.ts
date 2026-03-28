import { describe, expect, it } from "vitest";
import { buildLiveDictAreaUnpinnedParamAreaPainterPacket } from "./groupContainerUnpinnedParamAreaPainterPacket";

describe("buildLiveDictAreaUnpinnedParamAreaPainterPacket", () => {
  it("lifts the unpinned param-area draw packet into a stable painter packet", () => {
    expect(
      buildLiveDictAreaUnpinnedParamAreaPainterPacket({
        drawPacket: {
          blockId: "unpinned",
          kind: "unpinned-param-area",
          mount: {
            frameId: "dict-area-block:unpinned",
            mountKind: "scroll",
            orderIndex: 2,
            shouldMeasureAsFixed: false,
          },
          surfacePacket: {
            kind: "unpinned-param-area",
            styleColor: "amber",
            visualPacket: {
              blockId: "unpinned",
              container: {
                minHeight: 96,
                shouldApplyMinHeight: true,
              },
              kind: "unpinned-param-area",
              list: {
                listKey: "unpinned",
                requiredParamIdsToPaths: {
                  leaf: ["leaf"],
                },
                rowCount: 1,
                rows: [
                  {
                    depth: 0,
                    id: "leaf",
                    kind: "param-row",
                    label: "Leaf",
                    path: ["leaf"],
                  },
                ],
                topLevelParamIds: ["leaf"],
              },
              maxNestedDepth: 1,
              mount: {
                frameId: "dict-area-block:unpinned",
                mountKind: "scroll",
                orderIndex: 2,
                shouldMeasureAsFixed: false,
              },
            },
          },
        },
      }),
    ).toEqual({
      blockId: "unpinned",
      kind: "unpinned-param-area",
      mount: {
        frameId: "dict-area-block:unpinned",
        mountKind: "scroll",
        orderIndex: 2,
        shouldMeasureAsFixed: false,
      },
      styleColor: "amber",
      visualPacket: {
        blockId: "unpinned",
        container: {
          minHeight: 96,
          shouldApplyMinHeight: true,
        },
        kind: "unpinned-param-area",
        list: {
          listKey: "unpinned",
          requiredParamIdsToPaths: {
            leaf: ["leaf"],
          },
          rowCount: 1,
          rows: [
            {
              depth: 0,
              id: "leaf",
              kind: "param-row",
              label: "Leaf",
              path: ["leaf"],
            },
          ],
          topLevelParamIds: ["leaf"],
        },
        maxNestedDepth: 1,
        mount: {
          frameId: "dict-area-block:unpinned",
          mountKind: "scroll",
          orderIndex: 2,
          shouldMeasureAsFixed: false,
        },
      },
    });
  });
});
