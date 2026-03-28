import { describe, expect, it } from "vitest";
import { buildLiveDictAreaUnpinnedParamAreaVisualPacket } from "./groupContainerUnpinnedParamAreaVisualPacket";

describe("buildLiveDictAreaUnpinnedParamAreaVisualPacket", () => {
  it("lifts the unpinned param-area renderer packet into a deterministic scene-owned visual payload", () => {
    expect(
      buildLiveDictAreaUnpinnedParamAreaVisualPacket({
        rendererPacket: {
          blockId: "unpinned",
          grow: true,
          kind: "unpinned-param-area",
          listKey: "unpinned",
          maxNestedDepth: 4,
          minHeight: 96,
          mount: {
            frameId: "dict-area-block:unpinned",
            mountKind: "grow",
            orderIndex: 2,
            shouldMeasureAsFixed: false,
          },
          requiredParamIdsToPaths: {
            child: ["group", "child"],
          },
          rowCount: 2,
          rows: [
            { depth: 0, id: "group", kind: "group", label: "Group" },
            { depth: 1, id: "child", kind: "value", label: "Child" },
          ],
          shouldApplyMinHeight: true,
          shouldRoundBottom: true,
          title: "Params",
          topLevelParamIds: ["group"],
        },
      }),
    ).toEqual({
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
    });
  });
});
