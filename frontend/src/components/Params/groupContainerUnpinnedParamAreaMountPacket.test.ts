import { describe, expect, it } from "vitest";
import { buildLiveDictAreaUnpinnedParamAreaMountPacket } from "./groupContainerUnpinnedParamAreaMountPacket";

describe("buildLiveDictAreaUnpinnedParamAreaMountPacket", () => {
  it("lifts the unpinned param-area canvas packet into a stable mount packet", () => {
    expect(
      buildLiveDictAreaUnpinnedParamAreaMountPacket({
        canvasPacket: {
          blockId: "dict-area-block:unpinned",
          kind: "unpinned-param-area",
          mount: {
            frameId: "dict-area-block:unpinned",
            mountKind: "grow",
            orderIndex: 2,
            shouldMeasureAsFixed: false,
          },
          styleColor: "amber",
          visualPacket: {
            blockId: "dict-area-block:unpinned",
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
      blockId: "dict-area-block:unpinned",
      kind: "unpinned-param-area",
      mount: {
        frameId: "dict-area-block:unpinned",
        mountKind: "grow",
        orderIndex: 2,
        shouldMeasureAsFixed: false,
      },
      styleColor: "amber",
      visualPacket: {
        blockId: "dict-area-block:unpinned",
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
    });
  });
});
