import { describe, expect, test } from "vitest";

import { workflowGraphCanvasLayoutMetrics } from "./pixi-renderer-debug-snapshot";

describe("workflow graph debug snapshot", () => {
  test("uses the canvas layout metrics when the canvas has a client box", () => {
    const canvas = fakeElement({
      clientHeight: 200,
      clientWidth: 300,
      rect: rect({ height: 200, left: 10, top: 20, width: 300 }),
    });

    expect(workflowGraphCanvasLayoutMetrics(canvas)).toEqual({
      bottom: 220,
      clientHeight: 200,
      clientWidth: 300,
      left: 10,
      right: 310,
      top: 20,
    });
  });

  test("falls back to the attached parent layout when hidden Electron reports a zero canvas client box", () => {
    const parent = fakeElement({
      clientHeight: 720,
      clientWidth: 1280,
      rect: rect({ height: 720, left: 40, top: 30, width: 1280 }),
    });
    const canvas = fakeElement({
      clientHeight: 0,
      clientWidth: 0,
      parentElement: parent,
      rect: rect({ height: 0, left: 0, top: 0, width: 0 }),
    });

    expect(workflowGraphCanvasLayoutMetrics(canvas)).toEqual({
      bottom: 750,
      clientHeight: 720,
      clientWidth: 1280,
      left: 40,
      right: 1320,
      top: 30,
    });
  });

  test("keeps zero canvas metrics when neither canvas nor parent has a client box", () => {
    const canvas = fakeElement({
      clientHeight: 0,
      clientWidth: 0,
      rect: rect({ height: 0, left: 0, top: 0, width: 0 }),
    });

    expect(workflowGraphCanvasLayoutMetrics(canvas)).toEqual({
      bottom: 0,
      clientHeight: 0,
      clientWidth: 0,
      left: 0,
      right: 0,
      top: 0,
    });
  });

  test("falls back to renderer screen size when hidden Electron reports no DOM client box", () => {
    const canvas = fakeElement({
      clientHeight: 0,
      clientWidth: 0,
      rect: rect({ height: 0, left: 7, top: 11, width: 0 }),
    });

    expect(
      workflowGraphCanvasLayoutMetrics(canvas, {
        height: 2160,
        width: 3840,
      }),
    ).toEqual({
      bottom: 2171,
      clientHeight: 2160,
      clientWidth: 3840,
      left: 7,
      right: 3847,
      top: 11,
    });
  });
});

function fakeElement({ clientHeight, clientWidth, parentElement = null, rect }) {
  return {
    clientHeight,
    clientWidth,
    getBoundingClientRect: () => rect,
    parentElement,
  };
}

function rect({ height, left, top, width }) {
  return {
    bottom: top + height,
    height,
    left,
    right: left + width,
    top,
    width,
  };
}
