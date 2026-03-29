import { describe, expect, it } from "vitest";
import { SectionTypeEnum } from "utils/generatedTypes";
import { buildLiveDictAreaPinnedParamAreaMountPacket } from "./groupContainerPinnedParamAreaMountPacket";

describe("buildLiveDictAreaPinnedParamAreaMountPacket", () => {
  it("lifts the pinned param-area canvas packet into a stable mount packet", () => {
    expect(
      buildLiveDictAreaPinnedParamAreaMountPacket({
        canvasPacket: {
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
