/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  canUseCanvasFlowWebglTextureNodesByDefault,
  createCanvasFlowRenderer,
  getCanvasFlowRendererMode,
} from "./canvasFlowRenderer";
import type {
  CanvasFlowCanvasElement,
  CanvasFlowRenderer,
  CanvasFlowRendererMode,
  CanvasFlowRenderInputs,
  CanvasFlowWebglRenderingContext,
} from "./canvasFlowTypes";

describe("canvasFlowRenderer", () => {
  afterEach(() => {
    delete (window as { __settaCanvasFlowRenderer?: CanvasFlowRendererMode })
      .__settaCanvasFlowRenderer;
    delete (HTMLCanvasElement.prototype as Partial<CanvasFlowCanvasElement>)
      .requestPaint;
    vi.unstubAllGlobals();
  });

  it("defaults to the 2d renderer when WebGL texture support is unavailable", () => {
    const canvas = document.createElement("canvas");
    const create2dRenderer = vi.fn(() => createRendererStub());
    const createWebglRenderer = vi.fn(() => createRendererStub());

    createCanvasFlowRenderer({
      canvas,
      create2dRenderer,
      createWebglRenderer,
      initialInputs: createRenderInputs(),
    });

    expect(getCanvasFlowRendererMode()).toBe("2d");
    expect(create2dRenderer).toHaveBeenCalledTimes(1);
    expect(createWebglRenderer).not.toHaveBeenCalled();
  });

  it("defaults to WebGL texture nodes when required browser APIs are present", () => {
    installWebglTextureDefaultSupport();
    const canvas = document.createElement("canvas");
    const create2dRenderer = vi.fn(() => createRendererStub());
    const createWebglRenderer = vi.fn(() => createRendererStub());

    createCanvasFlowRenderer({
      canvas,
      create2dRenderer,
      createWebglRenderer,
      initialInputs: createRenderInputs(),
    });

    expect(getCanvasFlowRendererMode()).toBe("webgl-texture-nodes");
    expect(createWebglRenderer).toHaveBeenCalledTimes(1);
    expect(create2dRenderer).not.toHaveBeenCalled();
  });

  it("keeps explicit 2d renderer requests ahead of default support probing", () => {
    installWebglTextureDefaultSupport();
    (
      window as { __settaCanvasFlowRenderer?: CanvasFlowRendererMode }
    ).__settaCanvasFlowRenderer = "2d";
    const canvas = document.createElement("canvas");
    const create2dRenderer = vi.fn(() => createRendererStub());
    const createWebglRenderer = vi.fn(() => createRendererStub());

    createCanvasFlowRenderer({
      canvas,
      create2dRenderer,
      createWebglRenderer,
      initialInputs: createRenderInputs(),
    });

    expect(getCanvasFlowRendererMode()).toBe("2d");
    expect(create2dRenderer).toHaveBeenCalledTimes(1);
    expect(createWebglRenderer).not.toHaveBeenCalled();
  });

  it("selects WebGL when explicitly requested", () => {
    (
      window as { __settaCanvasFlowRenderer?: CanvasFlowRendererMode }
    ).__settaCanvasFlowRenderer = "webgl-texture-nodes";
    const canvas = document.createElement("canvas");
    const create2dRenderer = vi.fn(() => createRendererStub());
    const createWebglRenderer = vi.fn(() => createRendererStub());

    createCanvasFlowRenderer({
      canvas,
      create2dRenderer,
      createWebglRenderer,
      initialInputs: createRenderInputs(),
    });

    expect(getCanvasFlowRendererMode()).toBe("webgl-texture-nodes");
    expect(createWebglRenderer).toHaveBeenCalledTimes(1);
    expect(create2dRenderer).not.toHaveBeenCalled();
  });

  it("checks WebGL texture default support without creating a canvas context", () => {
    expect(canUseCanvasFlowWebglTextureNodesByDefault()).toBe(false);
    installWebglTextureDefaultSupport();
    expect(canUseCanvasFlowWebglTextureNodesByDefault()).toBe(true);
  });
});

function installWebglTextureDefaultSupport() {
  (
    HTMLCanvasElement.prototype as Partial<CanvasFlowCanvasElement>
  ).requestPaint = vi.fn();
  class WebGLRenderingContextMock {}
  (
    WebGLRenderingContextMock.prototype as Partial<CanvasFlowWebglRenderingContext>
  ).texElementImage2D = vi.fn();
  vi.stubGlobal("WebGLRenderingContext", WebGLRenderingContextMock);
}

function createRendererStub(): CanvasFlowRenderer {
  return {
    destroy: vi.fn(),
    handleCanvasPaint: vi.fn(),
    markNodesDirty: vi.fn(),
    requestFrame: vi.fn(),
    resize: vi.fn(),
    updateInputs: vi.fn(),
  };
}

function createRenderInputs(): CanvasFlowRenderInputs {
  return {
    connectionState: {
      connectionPosition: { x: 0, y: 0 },
      connectionStartHandle: null,
      connectionStatus: null,
    },
    darkMode: false,
    edgeHandlePositions: {},
    edges: [],
    gridSize: 20,
    nodeElements: new Map(),
    nodes: [],
    showGridLines: false,
    size: {
      cssHeight: 100,
      cssWidth: 100,
      pixelHeight: 100,
      pixelRatio: 1,
      pixelWidth: 100,
    },
    viewport: { x: 0, y: 0, zoom: 1 },
    wireColor: "#000",
  };
}
