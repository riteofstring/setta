import { describe, expect, it } from "vitest";
import { buildLiveDictAreaEdgeStripCanaryRenderView } from "./groupContainerEdgeStripCanaryRenderView";

describe("buildLiveDictAreaEdgeStripCanaryRenderView", () => {
  it("lifts the live edge-strip canary view into one explicit render block", () => {
    // The render helper should preserve the canary view payload while surfacing
    // the stable frame-id key used by the higher-level render boundary.
    expect(
      buildLiveDictAreaEdgeStripCanaryRenderView({
        canaryView: {
          blockId: "edges",
          domPacket: {
            bgColor: "bg-surface",
            blockId: "edges",
            kind: "edge-strip",
            mount: {
              frameId: "dict-area-block:edges",
              mountKind: "fixed",
              orderIndex: 0,
              shouldMeasureAsFixed: true,
            },
            positionAndSizeLocked: false,
            styleColor: "amber",
            visualPacket: {
              blockId: "edges",
              canConnect: true,
              estimatedHeight: 72,
              inputColumn: {
                ports: [],
                title: "In",
              },
              inputPortCount: 0,
              kind: "edge-strip",
              mount: {
                frameId: "dict-area-block:edges",
                mountKind: "fixed",
                orderIndex: 0,
                shouldMeasureAsFixed: true,
              },
              outputColumn: {
                ports: [],
                title: "Out",
              },
              outputPortCount: 0,
              portRowCount: 0,
              shouldRoundBottom: false,
              title: "Edges",
            },
          },
          kind: "edge-strip",
          mount: {
            frameId: "dict-area-block:edges",
            mountKind: "fixed",
            orderIndex: 0,
            shouldMeasureAsFixed: true,
          },
          scenePacket: {
            canConnect: true,
            inputPortCount: 1,
            inputPorts: [{ id: "input-a", label: "Input A" }],
            isSelectingParams: false,
            outputPortCount: 1,
            outputPorts: [{ id: "output-a", label: "Output A" }],
            selectedParamIds: ["input-a"],
          },
        },
      }),
    ).toEqual({
      blockId: "edges",
      domPacket: {
        bgColor: "bg-surface",
        blockId: "edges",
        kind: "edge-strip",
        mount: {
          frameId: "dict-area-block:edges",
          mountKind: "fixed",
          orderIndex: 0,
          shouldMeasureAsFixed: true,
        },
        positionAndSizeLocked: false,
        styleColor: "amber",
        visualPacket: {
          blockId: "edges",
          canConnect: true,
          estimatedHeight: 72,
          inputColumn: {
            ports: [],
            title: "In",
          },
          inputPortCount: 0,
          kind: "edge-strip",
          mount: {
            frameId: "dict-area-block:edges",
            mountKind: "fixed",
            orderIndex: 0,
            shouldMeasureAsFixed: true,
          },
          outputColumn: {
            ports: [],
            title: "Out",
          },
          outputPortCount: 0,
          portRowCount: 0,
          shouldRoundBottom: false,
          title: "Edges",
        },
      },
      key: "dict-area-block:edges",
      kind: "edge-strip",
      mount: {
        frameId: "dict-area-block:edges",
        mountKind: "fixed",
        orderIndex: 0,
        shouldMeasureAsFixed: true,
      },
      scenePacket: {
        canConnect: true,
        inputPortCount: 1,
        inputPorts: [{ id: "input-a", label: "Input A" }],
        isSelectingParams: false,
        outputPortCount: 1,
        outputPorts: [{ id: "output-a", label: "Output A" }],
        selectedParamIds: ["input-a"],
      },
    });
  });
});
