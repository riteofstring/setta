import {
  ActiveSelection,
  Group,
  Line,
  Point,
  Polyline,
  Textbox,
  filters,
  type FabricObject,
} from "fabric";
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
    drawImage: vi.fn(),
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

function installCanvasMocks(): void {
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
}

function selectObjects(
  drawing: RealtimeDrawingRuntime,
  objects: FabricObject[],
): void {
  drawing.canvas.discardActiveObject();
  for (const object of objects) {
    object.setCoords();
  }
  if (objects.length === 1) {
    drawing.canvas.setActiveObject(objects[0]!);
  } else {
    drawing.canvas.setActiveObject(
      new ActiveSelection(objects, { canvas: drawing.canvas }),
    );
  }
}

describe("retained drawing runtime", () => {
  it("draws, erases, selects, transforms, round-trips, and reaches raster export", async () => {
    installCanvasMocks();
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
    const lowerCanvasDraw = vi.spyOn(
      drawing.canvas.contextContainer,
      "drawImage",
    );
    lowerCanvasDraw.mockClear();
    brush.onMouseUp({ e: pointerEvent(), pointer: move });
    expect(drawing.canvas.getObjects().length).toBe(2);
    expect(previewed).toHaveBeenCalled();
    expect(lowerCanvasDraw).toHaveBeenCalled();

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
    const emptyScene = { objects: [], version: "7.4.0" };
    const emptySceneLoad = roundTrip.loadScene(emptyScene);
    expect(roundTrip.canvas.getObjects()).toHaveLength(1);
    expect(await emptySceneLoad).toBe(true);
    expect(roundTrip.canvas.getObjects()).toHaveLength(0);
    const supersededLoad = roundTrip.loadScene(emptyScene);
    const latestLoad = roundTrip.loadScene(scene);
    expect(await supersededLoad).toBe(false);
    expect(await latestLoad).toBe(true);
    expect(roundTrip.canvas.renderOnAddRemove).toBe(true);
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

  it("resizes logical canvas bounds as one undoable drawing change", async () => {
    installCanvasMocks();
    const settled = vi.fn();
    const element = document.createElement("canvas");
    document.body.append(element);
    const drawing = new RealtimeDrawingRuntime(element, {
      background: "#ffffff",
      height: 240,
      onHistoryChange: vi.fn(),
      onPreview: vi.fn(),
      onSettled: settled,
      width: 320,
    });
    drawing.resizeToFit(800, 300);
    const rectangle = drawing.addRectangle();
    settled.mockClear();

    expect(
      drawing.resizeCanvas({
        anchor: "center",
        height: 300,
        mode: "keep-artwork",
        width: 400,
      }),
    ).toBe(true);
    expect(drawing.getLogicalSize()).toEqual({ height: 300, width: 400 });
    expect(rectangle.left).toBe(72);
    expect(rectangle.top).toBe(62);
    expect(drawing.canvas.wrapperEl.style.width).toBe("400px");
    expect(drawing.canvas.wrapperEl.style.height).toBe("300px");
    expect(settled).toHaveBeenCalledOnce();

    expect(await drawing.undo()).toBe(true);
    expect(drawing.getLogicalSize()).toEqual({ height: 240, width: 320 });
    expect(drawing.canvas.getObjects()[0]).toMatchObject({ left: 32, top: 32 });
    expect(await drawing.redo()).toBe(true);
    expect(drawing.getLogicalSize()).toEqual({ height: 300, width: 400 });

    expect(
      drawing.resizeCanvas({
        anchor: "center",
        height: 600,
        mode: "scale-artwork",
        width: 800,
      }),
    ).toBe(true);
    expect(drawing.canvas.getObjects()[0]).toMatchObject({
      left: 144,
      scaleX: 2,
      scaleY: 2,
      top: 124,
    });
    await expect(drawing.captureSnapshot()).resolves.toMatchObject({
      height: 600,
      width: 800,
    });

    await drawing.dispose();
    element.remove();
  });

  it("creates built-in primitives and settles an edited text insertion once", async () => {
    installCanvasMocks();
    const previewed = vi.fn();
    const settled = vi.fn();
    const element = document.createElement("canvas");
    document.body.append(element);
    const drawing = new RealtimeDrawingRuntime(element, {
      background: "#ffffff",
      height: 240,
      onHistoryChange: vi.fn(),
      onPreview: previewed,
      onSettled: settled,
      width: 320,
    });

    expect(drawing.addLine()).toBeInstanceOf(Line);
    expect(drawing.addArrow()).toBeInstanceOf(Polyline);
    drawing.setTool("highlighter");
    drawing.setBrush("#ef4444", 20);
    expect(drawing.canvas.freeDrawingBrush).toMatchObject({
      color: "rgba(239,68,68,0.32)",
      decimate: 0.4,
      limitedToCanvasSize: true,
      straightLineKey: "shiftKey",
      width: 20,
    });
    const highlighterBrush = drawing.canvas.freeDrawingBrush!;
    const highlighterStart = new Point(80, 80);
    const highlighterEnd = new Point(140, 104);
    drawing.canvas.fire("mouse:down", {
      alreadySelected: false,
      e: pointerEvent("pointerdown", 80, 80),
      scenePoint: highlighterStart,
      viewportPoint: highlighterStart,
    });
    highlighterBrush.onMouseDown(highlighterStart, {
      e: pointerEvent("pointerdown", 80, 80),
      pointer: highlighterStart,
    });
    highlighterBrush.onMouseMove(highlighterEnd, {
      e: pointerEvent("pointermove", 140, 104),
      pointer: highlighterEnd,
    });
    highlighterBrush.onMouseUp({
      e: pointerEvent("pointerup", 140, 104),
      pointer: highlighterEnd,
    });
    expect(drawing.canvas.getObjects().at(-1)).toMatchObject({
      stroke: "rgba(239,68,68,0.32)",
      strokeWidth: 20,
    });
    drawing.setTool("draw");
    expect(drawing.canvas.freeDrawingBrush).toMatchObject({
      color: "#111827",
      width: 4,
    });

    previewed.mockClear();
    settled.mockClear();
    const text = drawing.addText();
    expect(text).toBeInstanceOf(Textbox);
    expect(text.isEditing).toBe(true);
    expect(previewed).toHaveBeenCalledOnce();
    expect(settled).not.toHaveBeenCalled();
    const snapshot = drawing.getSelectionSnapshot();
    expect(Object.isFrozen(snapshot)).toBe(true);
    expect(snapshot).toMatchObject({
      count: 1,
      kind: "text",
      supportsFill: true,
      supportsTypography: true,
    });

    const selectionChanged = vi.fn();
    const unsubscribe = drawing.subscribeSelection(selectionChanged);
    drawing.canvas.fire("selection:updated", {
      deselected: [],
      selected: [text],
    });
    expect(drawing.getSelectionSnapshot()).toBe(snapshot);
    expect(selectionChanged).not.toHaveBeenCalled();

    text.set("text", "Hello canvas");
    text.initDimensions();
    drawing.canvas.fire("text:changed", { target: text as never });
    expect(previewed).toHaveBeenCalledTimes(2);
    expect(settled).not.toHaveBeenCalled();
    text.exitEditing();
    expect(settled).toHaveBeenCalledOnce();

    settled.mockClear();
    text.enterEditing();
    text.exitEditing();
    expect(settled).not.toHaveBeenCalled();
    expect(
      drawing.setSelectionTypography({
        fontFamily: "Georgia",
        fontSize: 32,
        fontStyle: "italic",
        fontWeight: "bold",
        textAlign: "center",
      }),
    ).toBe(true);
    expect(settled).toHaveBeenCalledOnce();
    expect(drawing.getSelectionSnapshot()).toMatchObject({
      fontFamily: "Georgia",
      fontSize: 32,
      fontStyle: "italic",
      fontWeight: "bold",
      textAlign: "center",
    });

    settled.mockClear();
    expect(
      drawing.setSelectionAppearance({
        fill: "#2563eb",
        opacity: 0.75,
        stroke: "#111827",
        strokeWidth: 2,
      }),
    ).toBe(true);
    expect(settled).toHaveBeenCalledOnce();
    expect(drawing.getSelectionSnapshot()).toMatchObject({
      fillColor: "#2563eb",
      opacity: 0.75,
      strokeColor: "#111827",
      strokeWidth: 2,
    });
    expect(selectionChanged).toHaveBeenCalled();
    expect(
      (drawing.toScene() as { objects: Array<{ type: string }> }).objects.map(
        ({ type }) => type,
      ),
    ).toEqual(["Line", "Polyline", "Path", "Textbox"]);

    unsubscribe();
    await drawing.dispose();
    element.remove();
  });

  it("arranges, aligns, distributes, groups, clones, and nudges selections", async () => {
    installCanvasMocks();
    const settled = vi.fn();
    const element = document.createElement("canvas");
    document.body.append(element);
    const drawing = new RealtimeDrawingRuntime(element, {
      background: "#ffffff",
      height: 480,
      onHistoryChange: vi.fn(),
      onPreview: vi.fn(),
      onSettled: settled,
      width: 640,
    });
    const first = drawing.addRectangle();
    const second = drawing.addEllipse();
    const third = drawing.addLine();

    selectObjects(drawing, [first]);
    settled.mockClear();
    expect(drawing.bringSelectionForward()).toBe(true);
    expect(drawing.canvas.getObjects()).toEqual([second, first, third]);
    expect(drawing.bringSelectionToFront()).toBe(true);
    expect(drawing.canvas.getObjects()).toEqual([second, third, first]);
    expect(drawing.sendSelectionBackward()).toBe(true);
    expect(drawing.canvas.getObjects()).toEqual([second, first, third]);
    expect(drawing.sendSelectionToBack()).toBe(true);
    expect(drawing.canvas.getObjects()).toEqual([first, second, third]);
    expect(settled).toHaveBeenCalledTimes(4);

    const alignments = [
      ["left", (object: FabricObject) => object.getBoundingRect().left],
      [
        "horizontal-center",
        (object: FabricObject) => {
          const box = object.getBoundingRect();
          return box.left + box.width / 2;
        },
      ],
      [
        "right",
        (object: FabricObject) => {
          const box = object.getBoundingRect();
          return box.left + box.width;
        },
      ],
      ["top", (object: FabricObject) => object.getBoundingRect().top],
      [
        "vertical-center",
        (object: FabricObject) => {
          const box = object.getBoundingRect();
          return box.top + box.height / 2;
        },
      ],
      [
        "bottom",
        (object: FabricObject) => {
          const box = object.getBoundingRect();
          return box.top + box.height;
        },
      ],
    ] as const;
    for (const [alignment, coordinate] of alignments) {
      drawing.canvas.discardActiveObject();
      first.set({ left: 24, top: 18 });
      second.set({ left: 188, top: 126 });
      third.set({ left: 392, top: 264 });
      selectObjects(drawing, [first, second, third]);
      settled.mockClear();
      expect(drawing.alignSelection(alignment)).toBe(true);
      const values = [first, second, third].map(coordinate);
      expect(Math.max(...values) - Math.min(...values)).toBeCloseTo(0, 5);
      expect(settled).toHaveBeenCalledOnce();
    }

    const assertEvenGaps = (axis: "horizontal" | "vertical") => {
      const horizontal = axis === "horizontal";
      const boxes = [first, second, third]
        .map((object) => object.getBoundingRect())
        .sort((one, two) =>
          horizontal ? one.left - two.left : one.top - two.top,
        );
      const gap = (index: number) => {
        const one = boxes[index]!;
        const two = boxes[index + 1]!;
        return horizontal
          ? two.left - (one.left + one.width)
          : two.top - (one.top + one.height);
      };
      expect(gap(0)).toBeCloseTo(gap(1), 5);
    };
    drawing.canvas.discardActiveObject();
    first.set({ left: 18, top: 20 });
    second.set({ left: 148, top: 92 });
    third.set({ left: 472, top: 330 });
    selectObjects(drawing, [first, second, third]);
    settled.mockClear();
    expect(drawing.distributeSelection("horizontal")).toBe(true);
    assertEvenGaps("horizontal");
    expect(settled).toHaveBeenCalledOnce();

    drawing.canvas.discardActiveObject();
    first.set({ left: 18, top: 20 });
    second.set({ left: 148, top: 92 });
    third.set({ left: 472, top: 330 });
    selectObjects(drawing, [first, second, third]);
    settled.mockClear();
    expect(drawing.distributeSelection("vertical")).toBe(true);
    assertEvenGaps("vertical");
    expect(settled).toHaveBeenCalledOnce();

    selectObjects(drawing, [first, third]);
    settled.mockClear();
    expect(drawing.groupSelection()).toBe(true);
    expect(drawing.canvas.getActiveObject()).toBeInstanceOf(Group);
    expect(drawing.canvas.getObjects()).toHaveLength(2);
    expect(settled).toHaveBeenCalledOnce();
    expect(
      (drawing.toScene() as { objects: Array<{ type: string }> }).objects.some(
        ({ type }) => type === "Group",
      ),
    ).toBe(true);

    settled.mockClear();
    expect(drawing.ungroupSelection()).toBe(true);
    expect(drawing.canvas.getObjects()).toHaveLength(3);
    expect(settled).toHaveBeenCalledOnce();

    settled.mockClear();
    expect(await drawing.duplicateSelection()).toBe(true);
    expect(drawing.canvas.getObjects()).toHaveLength(5);
    expect(settled).toHaveBeenCalledOnce();
    settled.mockClear();
    expect(drawing.copySelection()).toBe(true);
    expect(await drawing.pasteSelection()).toBe(true);
    expect(drawing.canvas.getObjects()).toHaveLength(7);
    expect(settled).toHaveBeenCalledOnce();

    settled.mockClear();
    expect(drawing.selectAll()).toBe(true);
    expect(drawing.getSelectionSnapshot().count).toBe(7);
    const beforeNudge = drawing.canvas.getObjects()[0]!.getXY();
    expect(drawing.nudgeSelection(3, -2)).toBe(true);
    expect(drawing.canvas.getObjects()[0]!.getXY()).toEqual(
      beforeNudge.add(new Point(3, -2)),
    );
    expect(settled).toHaveBeenCalledOnce();
    settled.mockClear();
    expect(drawing.clearSelection()).toBe(true);
    expect(drawing.getSelectionSnapshot().count).toBe(0);
    expect(settled).not.toHaveBeenCalled();

    await drawing.dispose();
    element.remove();
  });

  it("keeps partially and recursively locked objects selectable and guarded", async () => {
    installCanvasMocks();
    const settled = vi.fn();
    const element = document.createElement("canvas");
    document.body.append(element);
    const drawing = new RealtimeDrawingRuntime(element, {
      background: "#ffffff",
      height: 240,
      onHistoryChange: vi.fn(),
      onPreview: vi.fn(),
      onSettled: settled,
      width: 320,
    });
    const locked = drawing.addRectangle();
    const removable = drawing.addEllipse();
    locked.set("lockMovementX", true);
    selectObjects(drawing, [locked]);
    expect(locked.selectable).toBe(true);
    expect(drawing.getSelectionSnapshot()).toMatchObject({
      canDelete: false,
      canDuplicate: false,
      canMoveForward: false,
      count: 1,
      locked: true,
    });
    expect(drawing.nudgeSelection(1, 0)).toBe(false);
    expect(drawing.bringSelectionToFront()).toBe(false);
    expect(drawing.deleteSelection()).toBe(false);
    expect(await drawing.duplicateSelection()).toBe(false);
    selectObjects(drawing, [locked, removable]);
    expect(drawing.canvas.getActiveObject()).toMatchObject({
      lockMovementX: true,
      lockMovementY: true,
      lockScalingX: true,
      lockScalingY: true,
    });
    expect(drawing.groupSelection()).toBe(false);

    settled.mockClear();
    expect(drawing.clear()).toBe(true);
    expect(drawing.canvas.getObjects()).toEqual([locked]);
    expect(settled).toHaveBeenCalledOnce();
    expect(
      (drawing.toScene() as { objects: Array<{ lockMovementX?: boolean }> })
        .objects[0]?.lockMovementX,
    ).toBe(true);
    selectObjects(drawing, [locked]);
    settled.mockClear();
    expect(drawing.toggleSelectionLock()).toBe(true);
    expect(locked).toMatchObject({
      lockMovementX: false,
      lockMovementY: false,
      lockScalingX: false,
      lockScalingY: false,
    });
    expect(settled).toHaveBeenCalledOnce();
    expect(drawing.nudgeSelection(1, 0)).toBe(true);
    expect(settled).toHaveBeenCalledTimes(2);

    const groupedWithLockedChild = drawing.addEllipse();
    selectObjects(drawing, [locked, groupedWithLockedChild]);
    expect(drawing.groupSelection()).toBe(true);
    const group = drawing.canvas.getActiveObject();
    expect(group).toBeInstanceOf(Group);
    if (!(group instanceof Group)) {
      throw new Error("Fabric did not activate the new group.");
    }
    const child = group.getObjects()[0]!;
    child.set("lockScalingY", true);
    drawing.canvas.fire("selection:updated", {
      deselected: [],
      selected: [group],
    });
    expect(drawing.getSelectionSnapshot()).toMatchObject({
      canDelete: false,
      canUngroup: false,
      locked: true,
    });
    expect(drawing.ungroupSelection()).toBe(false);
    expect(drawing.deleteSelection()).toBe(false);
    expect(drawing.toggleSelectionLock()).toBe(true);
    expect(child).toMatchObject({
      lockMovementX: false,
      lockMovementY: false,
      lockScalingX: false,
      lockScalingY: false,
    });
    expect(drawing.ungroupSelection()).toBe(true);

    await drawing.dispose();
    element.remove();
  });

  it("cancels stale asynchronous duplicate and paste work", async () => {
    installCanvasMocks();
    const element = document.createElement("canvas");
    document.body.append(element);
    const drawing = new RealtimeDrawingRuntime(element, {
      background: "#ffffff",
      height: 240,
      onHistoryChange: vi.fn(),
      onPreview: vi.fn(),
      onSettled: vi.fn(),
      width: 320,
    });
    const object = drawing.addRectangle();

    const duplicate = drawing.duplicateSelection();
    expect(drawing.clearSelection()).toBe(true);
    await expect(duplicate).resolves.toBe(false);
    expect(drawing.canvas.getObjects()).toEqual([object]);

    selectObjects(drawing, [object]);
    expect(drawing.copySelection()).toBe(true);
    const paste = drawing.pasteSelection();
    expect(drawing.copySelection()).toBe(true);
    await expect(paste).resolves.toBe(false);
    expect(drawing.canvas.getObjects()).toEqual([object]);

    await drawing.dispose();
    element.remove();
  });
});
