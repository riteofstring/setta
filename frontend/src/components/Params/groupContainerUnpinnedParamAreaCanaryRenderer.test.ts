import { describe, expect, it } from "vitest";
import { buildLiveDictAreaUnpinnedParamAreaCanaryRenderer } from "./groupContainerUnpinnedParamAreaCanaryRenderer";

describe("buildLiveDictAreaUnpinnedParamAreaCanaryRenderer", () => {
  it("lifts the live unpinned param-area canary view into one explicit renderer block", () => {
    const canaryView = {
      blockId: "unpinned",
      domPacket: {
        blockId: "unpinned",
        kind: "unpinned-param-area" as const,
        mount: {
          frameId: "dict-area-block:unpinned",
          mountKind: "grow" as const,
          orderIndex: 2,
          shouldMeasureAsFixed: false,
        },
        paramArea: {
          canEditLayout: true,
          id: "unpinned",
          kind: "param-area" as const,
          maxNestedDepth: 2,
          minHeight: 64,
          rows: [
            {
              depth: 0,
              id: "group",
              kind: "group" as const,
              label: "Unpinned Group",
            },
            {
              depth: 1,
              id: "leaf",
              kind: "value" as const,
              label: "Unpinned Value",
            },
          ],
          shouldRoundBottom: false,
        },
      },
      kind: "unpinned-param-area" as const,
      mount: {
        frameId: "dict-area-block:unpinned",
        mountKind: "grow" as const,
        orderIndex: 2,
        shouldMeasureAsFixed: false,
      },
      scenePacket: {
        grow: true,
        id: "unpinned",
        listKey: "unpinned",
        maxNestedDepth: 2,
        minHeight: 64,
        rowCount: 2,
        rows: [
          {
            depth: 0,
            id: "group",
            kind: "group" as const,
            label: "Unpinned Group",
          },
          {
            depth: 1,
            id: "leaf",
            kind: "value" as const,
            label: "Unpinned Value",
          },
        ],
        shouldApplyMinHeight: true,
        shouldRoundBottom: false,
        title: "Params",
        topLevelParamIds: ["group"],
      },
    };

    expect(
      buildLiveDictAreaUnpinnedParamAreaCanaryRenderer({
        canaryView,
      }),
    ).toEqual({
      ...canaryView,
      canaryView,
      key: "dict-area-block:unpinned",
    });
  });
});
