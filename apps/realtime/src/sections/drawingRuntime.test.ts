import { Point } from "fabric";
import { describe, expect, it, vi } from "vitest";

import { RealtimeDrawingRuntime } from "./drawingRuntime";

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

function pointerEvent(): MouseEvent {
  return new MouseEvent("pointermove", {
    bubbles: true,
    clientX: 20,
    clientY: 20,
  });
}

describe("retained drawing runtime", () => {
  it("draws, erases, selects, transforms, round-trips, and reaches raster export", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      function (this: HTMLCanvasElement) {
        return canvasContext(this);
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/png;base64,c2V0dGE=",
    );
    const settled = vi.fn();
    const element = document.createElement("canvas");
    document.body.append(element);
    const drawing = new RealtimeDrawingRuntime(element, {
      background: "#ffffff",
      height: 240,
      onSettled: settled,
      width: 320,
    });

    const retained = drawing.addRectangle();
    expect(drawing.canvas.getObjects()).toEqual([retained]);

    drawing.setTool("select");
    expect(retained.selectable).toBe(true);
    retained.set({ left: 64, scaleX: 1.5, top: 48 });
    retained.setCoords();
    drawing.canvas.fire("object:modified", { target: retained });
    expect(drawing.canvas.getActiveObject()).toBe(retained);

    drawing.setTool("draw");
    expect(drawing.canvas.isDrawingMode).toBe(true);
    expect(drawing.canvas.freeDrawingBrush).toBeDefined();
    const brush = drawing.canvas.freeDrawingBrush!;
    const down = new Point(12, 12);
    const move = new Point(48, 42);
    brush.onMouseDown(down, { e: pointerEvent(), pointer: down });
    brush.onMouseMove(move, { e: pointerEvent(), pointer: move });
    brush.onMouseUp({ e: pointerEvent(), pointer: move });
    expect(drawing.canvas.getObjects().length).toBe(2);

    drawing.setTool("erase");
    expect(drawing.canvas.isDrawingMode).toBe(false);
    expect(drawing.eraseObject(retained)).toBe(true);
    expect(drawing.canvas.getObjects()).toHaveLength(1);

    const scene = drawing.toScene();
    const roundTripElement = document.createElement("canvas");
    document.body.append(roundTripElement);
    const roundTrip = new RealtimeDrawingRuntime(roundTripElement, {
      background: "#ffffff",
      height: 240,
      onSettled: vi.fn(),
      width: 320,
    });
    await roundTrip.loadScene(scene);
    expect(roundTrip.canvas.getObjects()).toHaveLength(1);
    expect(roundTrip.toScene()).toEqual(scene);
    expect(roundTrip.toDataURL()).toMatch(/^data:image\/png;base64,/);
    expect(settled).toHaveBeenCalled();

    await roundTrip.dispose();
    await drawing.dispose();
    element.remove();
    roundTripElement.remove();
  });
});
