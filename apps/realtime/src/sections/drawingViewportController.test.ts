import { Canvas, Rect } from "fabric";
import { afterEach, describe, expect, it, vi } from "vitest";

import { DrawingViewportController } from "./drawingViewportController";

function canvasContext(element: HTMLCanvasElement): CanvasRenderingContext2D {
  const target: Record<PropertyKey, unknown> = {
    canvas: element,
    createImageData: (width: number, height: number) => ({
      data: new Uint8ClampedArray(width * height * 4),
      height,
      width,
    }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => null,
    createRadialGradient: () => ({ addColorStop: () => {} }),
    drawImage: vi.fn(),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    measureText: (text: string) => ({ width: text.length * 8 }),
  };
  return new Proxy(target, {
    get: (context, property) => context[property] ?? (() => {}),
    set: (context, property, value) => {
      context[property] = value;
      return true;
    },
  }) as unknown as CanvasRenderingContext2D;
}

function createCanvas(): Canvas {
  if (!vi.isMockFunction(HTMLCanvasElement.prototype.getContext)) {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      function (this: HTMLCanvasElement, contextId: string) {
        return contextId === "2d" ? canvasContext(this) : null;
      },
    );
  }
  const element = document.createElement("canvas");
  document.body.append(element);
  return new Canvas(element, { height: 240, width: 320 });
}

afterEach(() => {
  document.body.replaceChildren();
  vi.clearAllMocks();
});

describe("drawing viewport controller", () => {
  it("applies automatic fit without changing Fabric scene state", async () => {
    const canvas = createCanvas();
    canvas.add(new Rect({ height: 40, left: 20, top: 30, width: 60 }));
    const scene = canvas.toJSON();
    const viewportTransform = [...canvas.viewportTransform];
    const calcOffset = vi.spyOn(canvas, "calcOffset");
    const controller = new DrawingViewportController(
      canvas,
      { height: 240, width: 320 },
      { height: 120, width: 160 },
    );

    expect(canvas.wrapperEl.style.width).toBe("160px");
    expect(canvas.wrapperEl.style.height).toBe("120px");
    controller.resizeStage({ height: 300, width: 400 });
    expect(controller.getPresentation()).toEqual({
      displayHeight: 300,
      displayWidth: 400,
      scale: 1.25,
    });
    controller.resizeLogical({ height: 600, width: 400 });
    expect(controller.getPresentation()).toEqual({
      displayHeight: 300,
      displayWidth: 200,
      scale: 0.5,
    });
    expect(canvas.getWidth()).toBe(320);
    expect(canvas.getHeight()).toBe(240);
    expect(canvas.viewportTransform).toEqual(viewportTransform);
    expect(canvas.toJSON()).toEqual(scene);
    expect(calcOffset).toHaveBeenCalled();

    controller.dispose();
    await canvas.dispose();
  });

  it("owns one pointer-neutral grid layer and removes it on dispose", async () => {
    const canvas = createCanvas();
    const controller = new DrawingViewportController(
      canvas,
      { height: 240, width: 320 },
      { height: 120, width: 160 },
    );
    const grid = canvas.wrapperEl.querySelector<HTMLDivElement>(
      ".realtime-drawing-grid",
    );

    expect(grid).not.toBeNull();
    if (grid === null) {
      throw new Error("Drawing grid was not installed.");
    }
    const children = [...canvas.wrapperEl.children];
    expect(children.indexOf(canvas.lowerCanvasEl)).toBeLessThan(
      children.indexOf(grid),
    );
    expect(children.indexOf(grid)).toBeLessThan(
      children.indexOf(canvas.upperCanvasEl),
    );
    expect(grid.getAttribute("aria-hidden")).toBe("true");
    expect(grid.style.pointerEvents).toBe("none");
    expect(grid.hidden).toBe(true);

    controller.setGrid({ spacing: 20, visible: true });
    expect(grid.hidden).toBe(false);
    expect(grid.style.getPropertyValue("--realtime-drawing-grid-spacing")).toBe(
      "10px",
    );
    expect(grid.style.backgroundSize).toBe("10px 10px");
    expect(grid.style.width).toBe("160px");
    expect(grid.style.height).toBe("120px");

    controller.setGrid({ spacing: 1, visible: true });
    expect(grid.style.getPropertyValue("--realtime-drawing-grid-spacing")).toBe(
      "1px",
    );

    controller.dispose();
    expect(canvas.wrapperEl.querySelector(".realtime-drawing-grid")).toBeNull();
    controller.dispose();
    await canvas.dispose();
  });

  it("keeps a zero-scale stage finite and hides its grid", async () => {
    const canvas = createCanvas();
    const controller = new DrawingViewportController(
      canvas,
      { height: 240, width: 320 },
      { height: 0, width: 0 },
    );
    const grid = canvas.wrapperEl.querySelector<HTMLDivElement>(
      ".realtime-drawing-grid",
    );

    controller.setGrid({ spacing: 16, visible: true });
    expect(canvas.wrapperEl.style.width).toBe("0px");
    expect(canvas.wrapperEl.style.height).toBe("0px");
    expect(grid?.hidden).toBe(true);
    expect(
      grid?.style.getPropertyValue("--realtime-drawing-grid-spacing"),
    ).toBe("0px");

    controller.resizeStage({ height: 120, width: 160 });
    expect(grid?.hidden).toBe(false);
    expect(canvas.wrapperEl.style.width).toBe("160px");
    expect(canvas.wrapperEl.style.height).toBe("120px");

    controller.dispose();
    await canvas.dispose();
  });
});
