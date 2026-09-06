import {
  Canvas,
  Ellipse,
  FabricImage,
  PencilBrush,
  Rect,
  type FabricObject,
  type TPointerEventInfo,
} from "fabric";
import type { WorkspaceSectionData } from "@setta/workspace";

import type { DrawingSnapshot } from "./drawingSettlementQueue";

export type DrawingTool = "select" | "draw" | "erase";

export type DrawingHistoryState = {
  canRedo: boolean;
  canUndo: boolean;
};

type DrawingRuntimeOptions = {
  background: string;
  height: number;
  onHistoryChange: (state: DrawingHistoryState) => void;
  onPreview: () => void;
  onSettled: () => void;
  width: number;
};

function isSceneObject(
  scene: WorkspaceSectionData,
): scene is { [key: string]: WorkspaceSectionData } {
  return scene !== null && typeof scene === "object" && !Array.isArray(scene);
}

export class RealtimeDrawingRuntime {
  public readonly canvas: Canvas;
  public tool: DrawingTool = "draw";
  private readonly background: string;
  private drawing = false;
  private erasing = false;
  private erasedInGesture = false;
  private history: WorkspaceSectionData[] = [];
  private historyIndex = -1;
  private readonly logicalHeight: number;
  private readonly logicalWidth: number;
  private loading = false;
  private readonly onHistoryChange: (state: DrawingHistoryState) => void;
  private readonly onPreview: () => void;
  private readonly onSettled: () => void;
  private sceneLoad: AbortController | null = null;

  public constructor(
    element: HTMLCanvasElement,
    options: DrawingRuntimeOptions,
  ) {
    this.background = options.background;
    this.logicalHeight = options.height;
    this.logicalWidth = options.width;
    this.onHistoryChange = options.onHistoryChange;
    this.onPreview = options.onPreview;
    this.onSettled = options.onSettled;
    this.canvas = new Canvas(element, {
      backgroundColor: options.background,
      enablePointerEvents: true,
      height: options.height,
      preserveObjectStacking: true,
      selection: true,
      width: options.width,
    });
    const brush = new PencilBrush(this.canvas);
    brush.color = "#111827";
    brush.width = 4;
    this.canvas.freeDrawingBrush = brush;
    this.canvas.on("path:created", this.handleSettled);
    this.canvas.on("object:modified", this.handleSettled);
    this.canvas.on("mouse:down", this.handlePointerStart);
    this.canvas.on("mouse:move", this.handlePointerMove);
    this.canvas.on("mouse:up", this.handlePointerEnd);
    this.setTool("draw");
    this.history = [this.toScene()];
    this.historyIndex = 0;
    this.publishHistoryState();
  }

  public setTool(tool: DrawingTool): void {
    this.tool = tool;
    this.canvas.isDrawingMode = tool === "draw";
    this.canvas.selection = tool === "select";
    this.canvas.defaultCursor = tool === "erase" ? "crosshair" : "default";
    for (const object of this.canvas.getObjects()) {
      object.selectable = tool === "select";
      object.evented = true;
    }
    if (tool !== "select") {
      this.canvas.discardActiveObject();
    }
    this.canvas.requestRenderAll();
  }

  public addRectangle(): FabricObject {
    const offset = this.canvas.getObjects().length * 12;
    const object = new Rect({
      fill: "rgba(37, 99, 235, 0.12)",
      height: 72,
      left: 32 + offset,
      stroke: "#2563eb",
      strokeWidth: 2,
      top: 32 + offset,
      width: 112,
    });
    this.canvas.add(object);
    this.setTool("select");
    this.canvas.setActiveObject(object);
    this.canvas.requestRenderAll();
    this.recordSettledChange();
    return object;
  }

  public addEllipse(): FabricObject {
    const offset = this.canvas.getObjects().length * 12;
    const object = new Ellipse({
      fill: "rgba(37, 99, 235, 0.12)",
      left: 36 + offset,
      rx: 54,
      ry: 38,
      stroke: "#2563eb",
      strokeWidth: 2,
      top: 36 + offset,
    });
    this.canvas.add(object);
    this.setTool("select");
    this.canvas.setActiveObject(object);
    this.canvas.requestRenderAll();
    this.recordSettledChange();
    return object;
  }

  public addFilteredImage(
    source: HTMLCanvasElement,
    imageFilters: FabricImage["filters"],
  ): FabricImage {
    const image = new FabricImage(source, { left: 24, top: 24 });
    image.filters = [...imageFilters];
    image.applyFilters();
    this.canvas.add(image);
    this.setTool("select");
    this.canvas.setActiveObject(image);
    this.canvas.requestRenderAll();
    this.notifySettled();
    return image;
  }

  public eraseObject(object: FabricObject): boolean {
    if (!this.canvas.contains(object)) {
      return false;
    }
    this.canvas.remove(object);
    this.canvas.requestRenderAll();
    return true;
  }

  public clear(): void {
    const objects = this.canvas.getObjects();
    if (objects.length === 0) {
      return;
    }
    this.canvas.remove(...objects);
    this.canvas.requestRenderAll();
    this.recordSettledChange();
  }

  public deleteSelection(): boolean {
    const objects = this.canvas.getActiveObjects();
    if (objects.length === 0) {
      return false;
    }
    this.canvas.discardActiveObject();
    this.canvas.remove(...objects);
    this.canvas.requestRenderAll();
    this.recordSettledChange();
    return true;
  }

  public setBrush(color: string, width: number): void {
    const brush = this.canvas.freeDrawingBrush;
    if (brush === undefined) {
      return;
    }
    brush.color = color;
    brush.width = width;
  }

  public resizeToFit(availableWidth: number, availableHeight: number): void {
    if (
      !Number.isFinite(availableWidth) ||
      !Number.isFinite(availableHeight) ||
      availableWidth <= 0 ||
      availableHeight <= 0
    ) {
      return;
    }
    const scale = Math.min(
      availableWidth / this.logicalWidth,
      availableHeight / this.logicalHeight,
    );
    const width = Math.max(1, Math.floor(this.logicalWidth * scale));
    const height = Math.max(1, Math.floor(this.logicalHeight * scale));
    this.canvas.setDimensions(
      { height: `${height}px`, width: `${width}px` },
      { cssOnly: true },
    );
  }

  public async undo(): Promise<boolean> {
    if (this.historyIndex <= 0) {
      return false;
    }
    this.historyIndex -= 1;
    await this.applyScene(this.history[this.historyIndex]!);
    this.publishHistoryState();
    this.notifySettled();
    return true;
  }

  public async redo(): Promise<boolean> {
    if (this.historyIndex >= this.history.length - 1) {
      return false;
    }
    this.historyIndex += 1;
    await this.applyScene(this.history[this.historyIndex]!);
    this.publishHistoryState();
    this.notifySettled();
    return true;
  }

  public async loadScene(scene: WorkspaceSectionData): Promise<void> {
    await this.applyScene(scene);
    this.history = [this.toScene()];
    this.historyIndex = 0;
    this.publishHistoryState();
  }

  private async applyScene(scene: WorkspaceSectionData): Promise<void> {
    this.sceneLoad?.abort();
    const controller = new AbortController();
    this.sceneLoad = controller;
    this.loading = true;
    try {
      this.canvas.clear();
      this.canvas.backgroundColor = this.background;
      if (isSceneObject(scene)) {
        await this.canvas.loadFromJSON(scene, undefined, {
          signal: controller.signal,
        });
      }
      if (this.sceneLoad !== controller) {
        return;
      }
      this.canvas.backgroundColor = this.background;
      this.canvas.requestRenderAll();
      this.setTool(this.tool);
    } catch (error) {
      if (this.sceneLoad === controller && !controller.signal.aborted) {
        throw error;
      }
    } finally {
      if (this.sceneLoad === controller) {
        this.loading = false;
        this.sceneLoad = null;
      }
    }
  }

  public toScene(): WorkspaceSectionData {
    return this.canvas.toJSON() as WorkspaceSectionData;
  }

  public toDataURL(): string {
    return this.canvas.toDataURL({ format: "png", multiplier: 1 });
  }

  public async toBlob(): Promise<Blob> {
    const blob = await this.canvas.toBlob({ format: "png", multiplier: 1 });
    if (blob === null) {
      throw new Error("Realtime could not export the drawing snapshot.");
    }
    return blob;
  }

  public async captureSnapshot(): Promise<DrawingSnapshot> {
    const scene = this.toScene();
    const blob = await this.toBlob();
    return { blob, scene };
  }

  public async capturePreview(): Promise<DrawingSnapshot> {
    const element = document.createElement("canvas");
    element.width = this.canvas.lowerCanvasEl.width;
    element.height = this.canvas.lowerCanvasEl.height;
    const context = element.getContext("2d");
    if (context === null) {
      throw new Error("Realtime could not capture the drawing preview.");
    }
    context.drawImage(this.canvas.lowerCanvasEl, 0, 0);
    context.drawImage(this.canvas.upperCanvasEl, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      element.toBlob(resolve, "image/png"),
    );
    if (blob === null) {
      throw new Error("Realtime could not export the drawing preview.");
    }
    return { blob, scene: this.toScene() };
  }

  public async dispose(): Promise<void> {
    this.sceneLoad?.abort();
    this.sceneLoad = null;
    await this.canvas.dispose();
  }

  private readonly notifySettled = (): void => {
    if (!this.loading) {
      this.onSettled();
    }
  };

  private readonly handleSettled = (): void => {
    this.recordSettledChange();
  };

  private recordSettledChange(): void {
    if (this.loading) {
      return;
    }
    const scene = this.toScene();
    const current = this.history[this.historyIndex];
    if (
      current !== undefined &&
      JSON.stringify(current) === JSON.stringify(scene)
    ) {
      this.notifySettled();
      return;
    }
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(scene);
    this.historyIndex = this.history.length - 1;
    this.publishHistoryState();
    this.notifySettled();
  }

  private publishHistoryState(): void {
    this.onHistoryChange({
      canRedo:
        this.historyIndex >= 0 && this.historyIndex < this.history.length - 1,
      canUndo: this.historyIndex > 0,
    });
  }

  private eraseTarget(event: TPointerEventInfo): boolean {
    const target = event.target ?? this.canvas.findTarget(event.e).target;
    return target === undefined ? false : this.eraseObject(target);
  }

  private readonly handlePointerStart = (event: TPointerEventInfo): void => {
    if (this.tool === "draw") {
      this.drawing = true;
    } else if (this.tool === "erase") {
      this.erasing = true;
      this.erasedInGesture = this.eraseTarget(event);
    }
  };

  private readonly handlePointerMove = (event: TPointerEventInfo): void => {
    if (this.tool === "draw" && this.drawing) {
      this.onPreview();
    } else if (this.tool === "erase" && this.erasing) {
      const erased = this.eraseTarget(event);
      this.erasedInGesture = erased || this.erasedInGesture;
      if (erased) {
        this.onPreview();
      }
    }
  };

  private readonly handlePointerEnd = (): void => {
    this.drawing = false;
    if (this.erasing) {
      this.erasing = false;
      if (this.erasedInGesture) {
        this.recordSettledChange();
      }
      this.erasedInGesture = false;
    }
  };
}
