import { describe, expect, it } from "vitest";
import { SectionTypeEnum } from "utils/generatedTypes";
import { buildLiveDictAreaPinnedParamAreaDomPacket } from "./groupContainerPinnedParamAreaDomPacket";

describe("buildLiveDictAreaPinnedParamAreaDomPacket", () => {
  it("lifts the pinned param-area mount packet into a stable DOM packet", () => {
    expect(
      buildLiveDictAreaPinnedParamAreaDomPacket({
        mountPacket: {
          blockId: "dict-area-block:pinned",
          kind: "pinned-param-area",
          mount: {
            blockId: "dict-area-block:pinned",
            frameId: "dict-area-block:pinned",
            kind: "grow",
            orderIndex: 1,
          },
          positionAndSizeLocked: false,
          sectionTypeName: SectionTypeEnum.Dict,
          styleColor: "amber",
          visualPacket: {
            bottomRounded: true,
            container: {
              listClassName: "max-h-full",
            },
            header: {
              label: "Core",
            },
            rows: [],
          },
        },
      }),
    ).toEqual({
      blockId: "dict-area-block:pinned",
      kind: "pinned-param-area",
      mount: {
        blockId: "dict-area-block:pinned",
        frameId: "dict-area-block:pinned",
        kind: "grow",
        orderIndex: 1,
      },
      positionAndSizeLocked: false,
      sectionTypeName: SectionTypeEnum.Dict,
      styleColor: "amber",
      visualPacket: {
        bottomRounded: true,
        container: {
          listClassName: "max-h-full",
        },
        header: {
          label: "Core",
        },
        rows: [],
      },
    });
  });
});
