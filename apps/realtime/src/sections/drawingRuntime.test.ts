import { Point, filters } from "fabric";
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

function pointerEvent(
  type = "pointermove",
  clientX = 20,
  clientY = 20,
  pointerType = "mouse",
): PointerEvent {
  const event = new MouseEvent(type, {
    button: 0,
    bubbles: true,
    buttons: type === "pointerup" ? 0 : 1,
    clientX,
    clientY,
  });
  Object.defineProperties(event, {
    isPrimary: { value: true },
    pointerId: { value: 1 },
    pointerType: { value: pointerType },
  });
  return event as PointerEvent;
}

describe("retained drawing runtime", () => {
  it("draws, erases, selects, transforms, round-trips, and reaches raster export", async () => {
    vi.spyOn(HTMLCanvasElement.prototype, "getContext").mockImplementation(
      function (this: HTMLCanvasElement, contextId: string) {
        return contextId === "2d" ? canvasContext(this) : null;
      },
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toDataURL").mockReturnValue(
      "data:image/png;base64,c2V0dGE=",
    );
    vi.spyOn(HTMLCanvasElement.prototype, "toBlob").mockImplementation(
      (callback) => callback(new Blob(["setta"], { type: "image/png" })),
    );
    const historyChanged = vi.fn();
    const previewed = vi.fn();
    const settled = vi.fn();
    const element = document.createElement("canvas");
    document.body.append(element);
    const drawing = new RealtimeDrawingRuntime(element, {
      background: "#ffffff",
      height: 240,
      onHistoryChange: historyChanged,
      onPreview: previewed,
      onSettled: settled,
      width: 320,
    });
    drawing.resizeToFit(160, 200);
    expect(drawing.canvas.wrapperEl.style.width).toBe("160px");
    expect(drawing.canvas.wrapperEl.style.height).toBe("120px");
    expect(drawing.canvas.getWidth()).toBe(320);
    expect(drawing.canvas.getHeight()).toBe(240);
    drawing.resizeToFit(800, 300);
    expect(drawing.canvas.wrapperEl.style.width).toBe("400px");
    expect(drawing.canvas.wrapperEl.style.height).toBe("300px");

    const retained = drawing.addRectangle();
    expect(drawing.canvas.getObjects()).toEqual([retained]);
    expect(await drawing.undo()).toBe(true);
    expect(drawing.canvas.getObjects()).toHaveLength(0);
    expect(await drawing.redo()).toBe(true);
    expect(drawing.canvas.getObjects()).toHaveLength(1);
    const restored = drawing.canvas.getObjects()[0]!;

    drawing.setTool("select");
    expect(restored.selectable).toBe(true);
    drawing.canvas.setActiveObject(restored);
    restored.set({ left: 64, scaleX: 1.5, top: 48 });
    restored.setCoords();
    drawing.canvas.fire("object:modified", { target: restored });
    expect(drawing.canvas.getActiveObject()).toBe(restored);

    drawing.setTool("draw");
    expect(drawing.canvas.isDrawingMode).toBe(true);
    expect(drawing.canvas.freeDrawingBrush).toBeDefined();
    const brush = drawing.canvas.freeDrawingBrush!;
    const down = new Point(12, 12);
    const move = new Point(48, 42);
    drawing.canvas.fire("mouse:down", {
      alreadySelected: false,
      e: pointerEvent("pointerdown"),
      scenePoint: down,
      viewportPoint: down,
    });
    brush.onMouseDown(down, { e: pointerEvent(), pointer: down });
    brush.onMouseMove(move, { e: pointerEvent(), pointer: move });
    drawing.canvas.fire("mouse:move", {
      e: pointerEvent(),
      scenePoint: move,
      viewportPoint: move,
    });
    brush.onMouseUp({ e: pointerEvent(), pointer: move });
    expect(drawing.canvas.getObjects().length).toBe(2);
    expect(previewed).toHaveBeenCalled();

    drawing.setTool("erase");
    expect(drawing.canvas.isDrawingMode).toBe(false);
    drawing.canvas.calcOffset();
    drawing.canvas.upperCanvasEl.dispatchEvent(
      pointerEvent("pointerdown", 80, 60, "touch"),
    );
    document.dispatchEvent(pointerEvent("pointerup", 80, 60, "touch"));
    expect(drawing.canvas.getObjects()).toHaveLength(1);

    const imageSource = document.createElement("canvas");
    imageSource.width = 2;
    imageSource.height = 2;
    const image = drawing.addFilteredImage(imageSource, [
      new filters.Grayscale(),
    ]);
    const filteredScene = drawing.toScene() as {
      objects: Array<{ filters?: Array<{ type: string }>; type: string }>;
    };
    const serializedImage = filteredScene.objects.find(
      (object) => object.type === "Image",
    );
    expect(image.filters[0]).toBeInstanceOf(filters.Grayscale);
    expect(serializedImage?.filters).toEqual([
      expect.objectContaining({ type: "Grayscale" }),
    ]);
    const serializedFilter = serializedImage?.filters?.[0];
    if (serializedFilter === undefined) {
      throw new Error("Fabric did not serialize the image filter.");
    }
    const restoredFilter = await filters.Grayscale.fromObject(serializedFilter);
    image.filters = [restoredFilter];
    image.applyFilters();
    expect(image.toObject().filters).toEqual([
      expect.objectContaining({ type: "Grayscale" }),
    ]);
    drawing.eraseObject(image);

    const scene = drawing.toScene();
    const roundTripElement = document.createElement("canvas");
    document.body.append(roundTripElement);
    const roundTrip = new RealtimeDrawingRuntime(roundTripElement, {
      background: "#ffffff",
      height: 240,
      onHistoryChange: vi.fn(),
      onPreview: vi.fn(),
      onSettled: vi.fn(),
      width: 320,
    });
    await roundTrip.loadScene(scene);
    expect(roundTrip.canvas.getObjects()).toHaveLength(1);
    expect(roundTrip.toScene()).toEqual(scene);
    expect(roundTrip.toDataURL()).toMatch(/^data:image\/png;base64,/);
    const capture = await roundTrip.captureSnapshot();
    expect(capture.scene).toEqual(scene);
    expect(capture.blob.type).toBe("image/png");
    expect(settled).toHaveBeenCalled();

    await roundTrip.dispose();
    await drawing.dispose();
    element.remove();
    roundTripElement.remove();
  });
});
