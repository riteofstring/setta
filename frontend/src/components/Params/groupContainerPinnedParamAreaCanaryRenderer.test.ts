import { describe, expect, it } from "vitest";
import { buildLiveDictAreaPinnedParamAreaCanaryRenderer } from "./groupContainerPinnedParamAreaCanaryRenderer";

describe("buildLiveDictAreaPinnedParamAreaCanaryRenderer", () => {
  it("lifts the live pinned param-area canary view into one explicit renderer block", () => {
    const canaryView = {
      blockId: "pinned",
      domPacket: {
        blockId: "pinned",
        kind: "pinned-param-area" as const,
        mount: {
          frameId: "dict-area-block:pinned",
          mountKind: "fixed" as const,
          orderIndex: 1,
          shouldMeasureAsFixed: true,
        },
        paramArea: {
          canEditLayout: false,
          id: "pinned",
          kind: "param-area" as const,
          maxNestedDepth: 3,
          minHeight: null,
          rows: [
            {
              depth: 1,
              id: "leaf",
              kind: "value" as const,
              label: "Pinned Value",
            },
          ],
          shouldRoundBottom: true,
        },
      },
      kind: "pinned-param-area" as const,
      mount: {
        frameId: "dict-area-block:pinned",
        mountKind: "fixed" as const,
        orderIndex: 1,
        shouldMeasureAsFixed: true,
      },
      scenePacket: {
        id: "pinned",
        maxNestedDepth: 3,
        rowCount: 1,
        rows: [
          {
            depth: 1,
            id: "leaf",
            kind: "value" as const,
            label: "Pinned Value",
          },
        ],
        shouldRoundBottom: true,
      },
    };

    expect(
      buildLiveDictAreaPinnedParamAreaCanaryRenderer({
        canaryView,
      }),
    ).toEqual({
      ...canaryView,
      canaryView,
      key: "dict-area-block:pinned",
    });
  });
});
