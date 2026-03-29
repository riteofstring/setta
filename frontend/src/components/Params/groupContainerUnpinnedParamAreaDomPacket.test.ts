import { describe, expect, it } from "vitest";
import { buildLiveDictAreaUnpinnedParamAreaDomPacket } from "./groupContainerUnpinnedParamAreaDomPacket";

describe("buildLiveDictAreaUnpinnedParamAreaDomPacket", () => {
  it("lifts the unpinned param-area mount packet into a stable DOM packet", () => {
    expect(
      buildLiveDictAreaUnpinnedParamAreaDomPacket({
        mountPacket: {
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
      }),
    ).toEqual({
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
    });
  });
});
