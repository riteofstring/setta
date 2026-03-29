import { describe, expect, it } from "vitest";
import { buildLiveDictAreaUnpinnedParamAreaCanaryView } from "./groupContainerUnpinnedParamAreaCanaryView";

describe("buildLiveDictAreaUnpinnedParamAreaCanaryView", () => {
  it("lifts the live unpinned param-area canary packet into one explicit view block", () => {
    // The view helper should preserve the DOM/scene pairing while surfacing
    // the shared block-frame mount metadata for the higher-level canary view.
    expect(
      buildLiveDictAreaUnpinnedParamAreaCanaryView({
        canaryPacket: {
          blockId: "unpinned",
          domPacket: {
            blockId: "unpinned",
            kind: "unpinned-param-area",
            mount: {
              frameId: "dict-area-block:unpinned",
              mountKind: "grow",
              orderIndex: 2,
              shouldMeasureAsFixed: false,
            },
            paramArea: {
              canEditLayout: true,
              id: "unpinned",
              kind: "param-area",
              maxNestedDepth: 2,
              minHeight: 64,
              rows: [
                {
                  depth: 1,
                  id: "leaf",
                  kind: "value",
                  label: "Unpinned Value",
                },
              ],
              shouldRoundBottom: false,
            },
          },
          kind: "unpinned-param-area",
          scenePacket: {
            id: "unpinned",
            maxNestedDepth: 2,
            rowCount: 1,
            rows: [
              {
                depth: 1,
                id: "leaf",
                kind: "value",
                label: "Unpinned Value",
              },
            ],
            shouldRoundBottom: false,
          },
        },
      }),
    ).toEqual({
      blockId: "unpinned",
      domPacket: {
        blockId: "unpinned",
        kind: "unpinned-param-area",
        mount: {
          frameId: "dict-area-block:unpinned",
          mountKind: "grow",
          orderIndex: 2,
          shouldMeasureAsFixed: false,
        },
        paramArea: {
          canEditLayout: true,
          id: "unpinned",
          kind: "param-area",
          maxNestedDepth: 2,
          minHeight: 64,
          rows: [
            {
              depth: 1,
              id: "leaf",
              kind: "value",
              label: "Unpinned Value",
            },
          ],
          shouldRoundBottom: false,
        },
      },
      kind: "unpinned-param-area",
      mount: {
        frameId: "dict-area-block:unpinned",
        mountKind: "grow",
        orderIndex: 2,
        shouldMeasureAsFixed: false,
      },
      scenePacket: {
        id: "unpinned",
        maxNestedDepth: 2,
        rowCount: 1,
        rows: [
          {
            depth: 1,
            id: "leaf",
            kind: "value",
            label: "Unpinned Value",
          },
        ],
        shouldRoundBottom: false,
      },
    });
  });
});
