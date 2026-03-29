import { describe, expect, it } from "vitest";
import { SectionTypeEnum } from "utils/generatedTypes";
import { buildLiveDictAreaPinnedParamAreaCanvasPacket } from "./groupContainerPinnedParamAreaCanvasPacket";

describe("buildLiveDictAreaPinnedParamAreaCanvasPacket", () => {
  it("lifts the pinned param-area painter packet into a stable canvas packet", () => {
    expect(
      buildLiveDictAreaPinnedParamAreaCanvasPacket({
        painterPacket: {
          blockId: "pinned",
          kind: "pinned-param-area",
          mount: {
            frameId: "dict-area-block:pinned",
            mountKind: "grow",
            orderIndex: 1,
            shouldMeasureAsFixed: false,
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
                leaf: ["group", "leaf"],
              },
              rowCount: 1,
              rows: [],
              topLevelParamIds: ["group"],
            },
            maxNestedDepth: 2,
            mount: {
              frameId: "dict-area-block:pinned",
              mountKind: "grow",
              orderIndex: 1,
              shouldMeasureAsFixed: false,
            },
            shouldRoundBottom: false,
          },
        },
      }),
    ).toEqual({
      blockId: "pinned",
      kind: "pinned-param-area",
      mount: {
        frameId: "dict-area-block:pinned",
        mountKind: "grow",
        orderIndex: 1,
        shouldMeasureAsFixed: false,
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
            leaf: ["group", "leaf"],
          },
          rowCount: 1,
          rows: [],
          topLevelParamIds: ["group"],
        },
        maxNestedDepth: 2,
        mount: {
          frameId: "dict-area-block:pinned",
          mountKind: "grow",
          orderIndex: 1,
          shouldMeasureAsFixed: false,
        },
        shouldRoundBottom: false,
      },
    });
  });
});
