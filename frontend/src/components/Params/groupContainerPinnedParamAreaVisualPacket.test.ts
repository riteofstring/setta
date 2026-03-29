import { describe, expect, it } from "vitest";
import { buildLiveDictAreaPinnedParamAreaVisualPacket } from "./groupContainerPinnedParamAreaVisualPacket";

describe("buildLiveDictAreaPinnedParamAreaVisualPacket", () => {
  it("lifts the pinned param-area renderer packet into a deterministic scene-owned visual payload", () => {
    expect(
      buildLiveDictAreaPinnedParamAreaVisualPacket({
        isSelectingParams: true,
        rendererPacket: {
          blockId: "pinned",
          grow: false,
          kind: "pinned-param-area",
          listKey: "pinned",
          maxNestedDepth: 3,
          minHeight: null,
          mount: {
            frameId: "dict-area-block:pinned",
            mountKind: "fixed",
            orderIndex: 1,
            shouldMeasureAsFixed: true,
          },
          requiredParamIdsToPaths: {
            child: ["group", "child"],
          },
          rowCount: 2,
          rows: [
            { depth: 0, id: "group", kind: "group", label: "Group" },
            { depth: 1, id: "child", kind: "value", label: "Child" },
          ],
          shouldApplyMinHeight: false,
          shouldRoundBottom: true,
          title: "Pinned Params",
          topLevelParamIds: ["group"],
        },
        selectedParamIds: ["child"],
      }),
    ).toEqual({
      blockId: "pinned",
      header: {
        icon: "pin",
        title: "Pinned Params",
      },
      kind: "pinned-param-area",
      list: {
        isSelectingParams: true,
        listKey: "pinned",
        requiredParamIdsToPaths: {
          child: ["group", "child"],
        },
        rowCount: 2,
        rows: [
          { depth: 0, id: "group", kind: "group", label: "Group" },
          { depth: 1, id: "child", kind: "value", label: "Child" },
        ],
        selectedParamIds: ["child"],
        topLevelParamIds: ["group"],
      },
      maxNestedDepth: 3,
      mount: {
        frameId: "dict-area-block:pinned",
        mountKind: "fixed",
        orderIndex: 1,
        shouldMeasureAsFixed: true,
      },
      shouldRoundBottom: true,
    });
  });
});
