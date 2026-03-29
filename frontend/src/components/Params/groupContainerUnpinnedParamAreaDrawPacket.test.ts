import { describe, expect, it } from "vitest";
import { buildLiveDictAreaUnpinnedParamAreaDrawPacket } from "./groupContainerUnpinnedParamAreaDrawPacket";

describe("buildLiveDictAreaUnpinnedParamAreaDrawPacket", () => {
  it("lifts the unpinned param-area surface packet into a stable draw packet", () => {
    expect(
      buildLiveDictAreaUnpinnedParamAreaDrawPacket({
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
                child: ["group", "child"],
              },
              rowCount: 2,
              rows: [
                { depth: 0, id: "group", kind: "group", label: "Group" },
                { depth: 1, id: "child", kind: "value", label: "Child" },
              ],
              topLevelParamIds: ["group"],
            },
            maxNestedDepth: 4,
            mount: {
              frameId: "dict-area-block:unpinned",
              mountKind: "grow",
              orderIndex: 2,
              shouldMeasureAsFixed: false,
            },
          },
        },
      }),
    ).toEqual({
      blockId: "unpinned",
      kind: "unpinned-param-area",
      mount: {
        frameId: "dict-area-block:unpinned",
        mountKind: "grow",
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
              child: ["group", "child"],
            },
            rowCount: 2,
            rows: [
              { depth: 0, id: "group", kind: "group", label: "Group" },
              { depth: 1, id: "child", kind: "value", label: "Child" },
            ],
            topLevelParamIds: ["group"],
          },
          maxNestedDepth: 4,
          mount: {
            frameId: "dict-area-block:unpinned",
            mountKind: "grow",
            orderIndex: 2,
            shouldMeasureAsFixed: false,
          },
        },
      },
    });
  });
});
