import { describe, expect, it } from "vitest";
import { SectionTypeEnum } from "utils/generatedTypes";
import { buildLiveDictAreaPinnedParamAreaCanaryPacket } from "./groupContainerPinnedParamAreaCanaryPacket";

describe("buildLiveDictAreaPinnedParamAreaCanaryPacket", () => {
  it("pairs the live DOM pinned block with its scene packet", () => {
    expect(
      buildLiveDictAreaPinnedParamAreaCanaryPacket({
        domPacket: {
          blockId: "dict-area-block:pinned",
          kind: "pinned-param-area",
          mount: {
            frameId: "dict-area-block:pinned",
            kind: "grow",
            orderIndex: 1,
            blockId: "dict-area-block:pinned",
          },
          positionAndSizeLocked: false,
          sectionTypeName: SectionTypeEnum.Dict,
          styleColor: "amber",
          visualPacket: {
            bottomRounded: false,
            container: {
              listClassName: "max-h-full",
            },
            header: {
              label: "Pinned Params",
            },
            rows: [],
          },
        },
        scenePacket: {
          grow: false,
          id: "pinned",
          listKey: "pinned",
          maxNestedDepth: 1,
          minHeight: null,
          requiredParamIdsToPaths: {
            "row-0": ["row-0"],
          },
          rowCount: 1,
          rows: [
            {
              depth: 0,
              id: "row-0",
              kind: "group",
              label: "Pinned Group",
            },
          ],
          shouldApplyMinHeight: false,
          shouldRoundBottom: false,
          title: "Pinned Params",
          topLevelParamIds: ["row-0"],
        },
      }),
    ).toEqual({
      blockId: "dict-area-block:pinned",
      domPacket: {
        blockId: "dict-area-block:pinned",
        kind: "pinned-param-area",
        mount: {
          frameId: "dict-area-block:pinned",
          kind: "grow",
          orderIndex: 1,
          blockId: "dict-area-block:pinned",
        },
        positionAndSizeLocked: false,
        sectionTypeName: SectionTypeEnum.Dict,
        styleColor: "amber",
        visualPacket: {
          bottomRounded: false,
          container: {
            listClassName: "max-h-full",
          },
          header: {
            label: "Pinned Params",
          },
          rows: [],
        },
      },
      kind: "pinned-param-area",
      scenePacket: {
        grow: false,
        id: "pinned",
        listKey: "pinned",
        maxNestedDepth: 1,
        minHeight: null,
        requiredParamIdsToPaths: {
          "row-0": ["row-0"],
        },
        rowCount: 1,
        rows: [
          {
            depth: 0,
            id: "row-0",
            kind: "group",
            label: "Pinned Group",
          },
        ],
        shouldApplyMinHeight: false,
        shouldRoundBottom: false,
        title: "Pinned Params",
        topLevelParamIds: ["row-0"],
      },
    });
  });
});
