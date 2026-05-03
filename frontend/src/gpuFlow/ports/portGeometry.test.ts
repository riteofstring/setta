// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { HandlePosition } from "../flowTypes";
import {
  buildGpuFlowPortEndpoints,
  makeGpuFlowPortKey,
  measureGpuFlowPortElementLocalRect,
  registerGpuFlowPortDescriptor,
  registerGpuFlowPortsWithSharedElement,
  updateGpuFlowPortLocalRectsForNodes,
  useGpuFlowPortRegistry,
} from "./portGeometry";

describe("GpuFlow port geometry", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    useGpuFlowPortRegistry.getState().reset();
  });

  it("derives endpoint flow positions from source-local port rects and layout nodes", () => {
    const key = registerGpuFlowPortDescriptor({
      isConnectableEnd: true,
      localRect: { height: 12, width: 20, x: 180, y: 30 },
      nodeId: "section-a",
      portId: "out",
      side: HandlePosition.Right,
      type: "source",
    });

    expect(key).toBe(makeGpuFlowPortKey("section-a", "out", "source"));
    expect(
      buildGpuFlowPortEndpoints({
        layoutNodes: [
          {
            height: 100,
            nodeId: "section-a",
            width: 220,
            x: 40,
            y: 70,
          },
        ],
        ports: useGpuFlowPortRegistry.getState().descriptors,
      }),
    ).toEqual({
      [key]: {
        nodeId: "section-a",
        normal: { x: 1, y: 0 },
        portId: "out",
        side: HandlePosition.Right,
        type: "source",
        x: 230,
        y: 106,
      },
    });

    expect(
      buildGpuFlowPortEndpoints({
        layoutNodes: [
          {
            height: 100,
            nodeId: "section-a",
            width: 220,
            x: 80,
            y: 95,
          },
        ],
        ports: useGpuFlowPortRegistry.getState().descriptors,
      })[key],
    ).toMatchObject({ x: 270, y: 131 });
  });

  it("measures handle geometry in source-local coordinates without screen rects", () => {
    const source = document.createElement("div");
    source.dataset.gpuFlowNode = "true";
    const row = document.createElement("div");
    const handle = document.createElement("div");
    source.append(row);
    row.append(handle);
    document.body.append(source);
    setOffset(source, { height: 100, left: 0, top: 0, width: 220 });
    setOffset(row, { height: 20, left: 12, top: 30, width: 180 });
    setOffset(handle, { height: 8, left: 160, top: 6, width: 10 });
    handle.getBoundingClientRect = vi.fn(() => {
      throw new Error("screen rects are not a port-geometry source");
    });

    expect(measureGpuFlowPortElementLocalRect(handle)).toEqual({
      height: 8,
      width: 10,
      x: 172,
      y: 36,
    });
    expect(handle.getBoundingClientRect).not.toHaveBeenCalled();
  });

  it("updates registered shared-handle local rects from source-local DOM", () => {
    const source = document.createElement("div");
    source.dataset.gpuFlowNode = "true";
    const handle = document.createElement("div");
    source.append(handle);
    document.body.append(source);
    setOffset(source, { height: 100, left: 0, top: 0, width: 220 });
    setOffset(handle, { height: 10, left: 4, top: 20, width: 10 });

    registerGpuFlowPortsWithSharedElement({
      element: handle,
      nodeId: "section-a",
      portIds: ["in-a", "in-b"],
      side: HandlePosition.Left,
      type: "target",
    });
    setOffset(handle, { height: 10, left: 4, top: 44, width: 10 });

    updateGpuFlowPortLocalRectsForNodes(["section-a"]);

    expect(
      useGpuFlowPortRegistry.getState().descriptors[
        makeGpuFlowPortKey("section-a", "in-a", "target")
      ]?.localRect,
    ).toEqual({ height: 10, width: 10, x: 4, y: 44 });
    expect(
      useGpuFlowPortRegistry.getState().descriptors[
        makeGpuFlowPortKey("section-a", "in-b", "target")
      ]?.localRect,
    ).toEqual({ height: 10, width: 10, x: 4, y: 44 });
  });
});

function setOffset(
  element: HTMLElement,
  rect: {
    readonly height: number;
    readonly left: number;
    readonly top: number;
    readonly width: number;
  },
): void {
  Object.defineProperties(element, {
    offsetHeight: { configurable: true, value: rect.height },
    offsetLeft: { configurable: true, value: rect.left },
    offsetTop: { configurable: true, value: rect.top },
    offsetWidth: { configurable: true, value: rect.width },
  });
}
