import { describe, expect, it } from "vitest";
import { buildLiveDictAreaEdgeStripCanaryView } from "./groupContainerEdgeStripCanaryView";

describe("buildLiveDictAreaEdgeStripCanaryView", () => {
  it("lifts the live edge-strip canary packet into one explicit view block", () => {
    // The view helper should preserve the DOM/scene pairing while surfacing
    // the shared block-frame mount metadata for the higher-level canary view.
    expect(
      buildLiveDictAreaEdgeStripCanaryView({
        canaryPacket: {
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
