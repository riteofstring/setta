import { describe, expect, it } from "vitest";
import { buildLiveDictAreaPinnedParamAreaCanaryRenderView } from "./groupContainerPinnedParamAreaCanaryRenderView";

describe("buildLiveDictAreaPinnedParamAreaCanaryRenderView", () => {
  it("lifts the live pinned param-area canary view into one explicit render block", () => {
    // The render helper should preserve the canary view payload while surfacing
    // the stable frame-id key used by the higher-level render boundary.
    expect(
      buildLiveDictAreaPinnedParamAreaCanaryRenderView({
        canaryView: {
          blockId: "pinned",
          domPacket: {
            blockId: "pinned",
            kind: "pinned-param-area",
            mount: {
              frameId: "dict-area-block:pinned",
              mountKind: "fixed",
              orderIndex: 1,
              shouldMeasureAsFixed: true,
            },
            paramArea: {
              canEditLayout: false,
              id: "pinned",
              kind: "param-area",
              maxNestedDepth: 3,
              minHeight: null,
              rows: [
                {
                  depth: 1,
                  id: "leaf",
                  kind: "value",
                  label: "Pinned Value",
                },
              ],
              shouldRoundBottom: true,
            },
          },
          kind: "pinned-param-area",
          mount: {
            frameId: "dict-area-block:pinned",
            mountKind: "fixed",
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
                kind: "value",
                label: "Pinned Value",
              },
            ],
            shouldRoundBottom: true,
          },
        },
      }),
    ).toEqual({
      blockId: "pinned",
      domPacket: {
        blockId: "pinned",
        kind: "pinned-param-area",
        mount: {
          frameId: "dict-area-block:pinned",
          mountKind: "fixed",
          orderIndex: 1,
          shouldMeasureAsFixed: true,
        },
        paramArea: {
          canEditLayout: false,
          id: "pinned",
          kind: "param-area",
          maxNestedDepth: 3,
          minHeight: null,
          rows: [
            {
              depth: 1,
              id: "leaf",
              kind: "value",
              label: "Pinned Value",
            },
          ],
          shouldRoundBottom: true,
        },
      },
      key: "dict-area-block:pinned",
      kind: "pinned-param-area",
      mount: {
        frameId: "dict-area-block:pinned",
        mountKind: "fixed",
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
            kind: "value",
            label: "Pinned Value",
          },
        ],
        shouldRoundBottom: true,
      },
    });
  });
});
