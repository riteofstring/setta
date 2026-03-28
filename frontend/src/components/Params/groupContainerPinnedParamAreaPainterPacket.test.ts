import { SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { buildLiveDictAreaPinnedParamAreaPainterPacket } from "./groupContainerPinnedParamAreaPainterPacket";

describe("buildLiveDictAreaPinnedParamAreaPainterPacket", () => {
  it("lifts the pinned param-area draw packet into a stable painter packet", () => {
    expect(
      buildLiveDictAreaPinnedParamAreaPainterPacket({
        drawPacket: {
          blockId: "pinned",
          kind: "pinned-param-area",
          mount: {
            frameId: "dict-area-block:pinned",
            mountKind: "fixed",
            orderIndex: 1,
            shouldMeasureAsFixed: true,
          },
          surfacePacket: {
            kind: "pinned-param-area",
            positionAndSizeLocked: false,
            sectionTypeName: SectionTypeEnum.Dict,
            styleColor: "amber",
            visualPacket: {
              blockId: "pinned",
              header: {
                icon: "pin",
                title: "Pinned Params",
              },
              kind: "pinned-param-area",
              list: {
                listKey: "pinned",
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
                frameId: "dict-area-block:pinned",
                mountKind: "fixed",
                orderIndex: 1,
                shouldMeasureAsFixed: true,
              },
              shouldRoundBottom: false,
            },
          },
        },
      }),
    ).toEqual({
      blockId: "pinned",
      kind: "pinned-param-area",
      mount: {
        frameId: "dict-area-block:pinned",
        mountKind: "fixed",
        orderIndex: 1,
        shouldMeasureAsFixed: true,
      },
      positionAndSizeLocked: false,
      sectionTypeName: SectionTypeEnum.Dict,
      styleColor: "amber",
      visualPacket: {
        blockId: "pinned",
        header: {
          icon: "pin",
          title: "Pinned Params",
        },
        kind: "pinned-param-area",
        list: {
          listKey: "pinned",
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
          frameId: "dict-area-block:pinned",
          mountKind: "fixed",
          orderIndex: 1,
          shouldMeasureAsFixed: true,
        },
        shouldRoundBottom: false,
      },
    });
  });
});
