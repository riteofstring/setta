import { describe, expect, it } from "vitest";
import { buildLiveDictAreaPinnedParamAreaCanaryView } from "./groupContainerPinnedParamAreaCanaryView";

describe("buildLiveDictAreaPinnedParamAreaCanaryView", () => {
  it("lifts the live pinned param-area canary packet into one explicit view block", () => {
    // The view helper should preserve the DOM/scene pairing while surfacing
    // the shared block-frame mount metadata for the higher-level canary view.
    expect(
      buildLiveDictAreaPinnedParamAreaCanaryView({
        canaryPacket: {
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
