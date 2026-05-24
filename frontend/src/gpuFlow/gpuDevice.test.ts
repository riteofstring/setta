/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, type MockInstance, vi } from "vitest";
import {
  assertHtmlInCanvasSupport,
  GpuFlowSupportError,
  initializeGpuFlowDevice,
} from "./gpuDevice";

describe("initializeGpuFlowDevice", () => {
  const originalNavigatorGpu = Object.getOwnPropertyDescriptor(
    navigator,
    "gpu",
  );

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    if (originalNavigatorGpu) {
      Object.defineProperty(navigator, "gpu", originalNavigatorGpu);
      return;
    }
    delete (navigator as Navigator & { gpu?: GPU }).gpu;
  });

  it("requests the adapter texture limit and configures the layoutsubtree canvas", async () => {
    const canvas = createHtmlInCanvasElement();
    const gpu = installWebGpuMock(canvas);
    installDrawElementImageSupport();

    const runtime = await initializeGpuFlowDevice(canvas);

    expect(gpu.requestDevice).toHaveBeenCalledWith({
      requiredLimits: {
        maxTextureDimension2D: 16384,
      },
    });
    expect(gpu.configure).toHaveBeenCalledWith({
      alphaMode: "premultiplied",
      device: gpu.device,
      format: "bgra8unorm",
    });
    expect(canvas.getAttribute("layoutsubtree")).toBe("");
    expect(
      (canvas as HTMLCanvasElement & { layoutSubtree: boolean }).layoutSubtree,
    ).toBe(true);
    expect(runtime.maxTextureDimension2D).toBe(16384);

    runtime.destroy();
    expect(gpu.unconfigure).toHaveBeenCalledTimes(1);
    expect(gpu.destroy).toHaveBeenCalledTimes(1);
  });

  it("does not claim a 2D context while checking drawElementImage support", async () => {
    const canvas = createHtmlInCanvasElement();
    const gpu = installWebGpuMock(canvas);
    installDrawElementImageSupport();

    await initializeGpuFlowDevice(canvas);

    expect(gpu.getContext).toHaveBeenCalledTimes(1);
    expect(gpu.getContext).toHaveBeenCalledWith("webgpu");
  });

  it("fails loudly when WebGPU is unavailable", async () => {
    const canvas = createHtmlInCanvasElement();
    installDrawElementImageSupport();
    Object.defineProperty(navigator, "gpu", {
      configurable: true,
      value: undefined,
    });

    await expect(initializeGpuFlowDevice(canvas)).rejects.toMatchObject({
      reason: "webgpu-missing",
    });
  });

  it("fails loudly when element texture upload is unavailable", async () => {
    const canvas = createHtmlInCanvasElement();
    installWebGpuMock(canvas, { elementUpload: false });
    installDrawElementImageSupport();

    await expect(initializeGpuFlowDevice(canvas)).rejects.toMatchObject({
      reason: "copy-element-image-to-texture-missing",
    });
  });
});

describe("assertHtmlInCanvasSupport", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("requires drawElementImage support without creating a canvas context", () => {
    const canvas = createHtmlInCanvasElement();
    const getContext = vi.spyOn(canvas, "getContext");

    expect(() => assertHtmlInCanvasSupport(canvas)).toThrow(
      GpuFlowSupportError,
    );
    expect(getContext).not.toHaveBeenCalled();
  });
});

type WebGpuMockOptions = {
  elementUpload?: boolean;
};

type WebGpuMock = {
  configure: ReturnType<typeof vi.fn>;
  destroy: ReturnType<typeof vi.fn>;
  device: GPUDevice;
  getContext: MockInstance<HTMLCanvasElement["getContext"]>;
  requestDevice: ReturnType<typeof vi.fn>;
  unconfigure: ReturnType<typeof vi.fn>;
};

function createHtmlInCanvasElement(): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  Object.defineProperties(canvas, {
    layoutSubtree: {
      configurable: true,
      value: false,
      writable: true,
    },
    onpaint: {
      configurable: true,
      value: null,
      writable: true,
    },
    requestPaint: {
      configurable: true,
      value: vi.fn(),
    },
  });
  return canvas;
}

function installDrawElementImageSupport() {
  const CanvasRenderingContext2DMock =
    function CanvasRenderingContext2DMock() {};
  CanvasRenderingContext2DMock.prototype.drawElementImage = vi.fn();
  vi.stubGlobal("CanvasRenderingContext2D", CanvasRenderingContext2DMock);
}

function installWebGpuMock(
  canvas: HTMLCanvasElement,
  options: WebGpuMockOptions = {},
): WebGpuMock {
  const configure = vi.fn();
  const unconfigure = vi.fn();
  const destroy = vi.fn();
  const queue =
    options.elementUpload === false
      ? {}
      : { copyElementImageToTexture: vi.fn() };
  const device = {
    destroy,
    limits: {
      maxTextureDimension2D: 16384,
    },
    queue,
  } as unknown as GPUDevice;
  const requestDevice = vi.fn(() => Promise.resolve(device));
  const adapter = {
    limits: {
      maxTextureDimension2D: 16384,
    },
    requestDevice,
  } as unknown as GPUAdapter;
  const requestAdapter = vi.fn(() => Promise.resolve(adapter));
  const gpu = {
    getPreferredCanvasFormat: vi.fn(() => "bgra8unorm" as GPUTextureFormat),
    requestAdapter,
  } as unknown as GPU;
  const context = {
    configure,
    unconfigure,
  } as unknown as GPUCanvasContext;
  const getContext = vi.spyOn(canvas, "getContext").mockImplementation(((
    contextId: string,
  ) => {
    if (contextId === "webgpu") {
      return context;
    }
    return null;
  }) as HTMLCanvasElement["getContext"]);

  Object.defineProperty(navigator, "gpu", {
    configurable: true,
    value: gpu,
  });

  return {
    configure,
    destroy,
    device,
    getContext,
    requestDevice,
    unconfigure,
  };
}
