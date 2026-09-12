import {
  Canvas,
  Color,
  Ellipse,
  FabricImage,
  Group,
  Line,
  PencilBrush,
  Polyline,
  Rect,
  Textbox,
  type FabricObject,
  type TPointerEventInfo,
  util,
} from "fabric";
import type { WorkspaceSectionData } from "@setta/workspace";

import {
  DRAWING_OBJECT_SERIALIZATION_PROPERTIES,
  alignDrawingObjects,
  applyDrawingAppearance,
  applyDrawingTypography,
  createDrawingSelectionSnapshot,
  distributeDrawingObjects,
  isDrawingObjectLocked,
  restoreDrawingSelection,
  selectedDrawingObjects,
  setDrawingObjectsLocked,
  synchronizeDrawingSelectionLock,
  type DrawingAlignment,
  type DrawingDistribution,
  type DrawingSelectionAppearancePatch,
  type DrawingSelectionSnapshot,
  type DrawingSelectionTypographyPatch,
} from "./drawingObjectModel";
import type { DrawingSnapshot } from "./drawingSettlementQueue";

export type {
  DrawingAlignment,
  DrawingDistribution,
  DrawingSelectionAppearancePatch,
  DrawingSelectionKind,
  DrawingSelectionSnapshot,
  DrawingSelectionTypographyPatch,
  DrawingSelectionValue,
  DrawingTextAlign,
} from "./drawingObjectModel";

export type DrawingTool = "select" | "draw" | "highlighter" | "erase";

export type DrawingHistoryState = {
  canRedo: boolean;
  canUndo: boolean;
};

export const DRAWING_CANVAS_MAX_SIZE = 8192;
export const DRAWING_CANVAS_MIN_SIZE = 1;

export type DrawingCanvasAnchor =
  | "top-left"
  | "top"
  | "top-right"
  | "left"
  | "center"
  | "right"
  | "bottom-left"
  | "bottom"
  | "bottom-right";

export type DrawingCanvasResizeRequest = {
  anchor: DrawingCanvasAnchor;
  height: number;
  mode: "keep-artwork" | "scale-artwork";
  width: number;
};

type DrawingCanvasDocument = {
  height: number;
  scene: WorkspaceSectionData;
  width: number;
};

type DrawingRuntimeOptions = {
  background: string;
  height: number;
  onHistoryChange: (state: DrawingHistoryState) => void;
  onPreview: () => void;
  onSettled: () => void;
  width: number;
};

type DrawingHistoryEntry = DrawingCanvasDocument;

type DrawingSerializedObject = Record<string, WorkspaceSectionData>;

type DrawingAsyncOperation = {
  controller: AbortController;
  kind: "duplicate" | "paste";
  revision: number;
};

type BrushSettings = {
  color: string;
  width: number;
};

const DRAWING_HIGHLIGHTER_ALPHA = 0.32;
const DRAWING_OBJECT_OFFSET = 12;

const DRAWING_CANVAS_ANCHOR_FACTORS: Record<
  DrawingCanvasAnchor,
  { x: number; y: number }
> = {
  "bottom-left": { x: 0, y: 1 },
  "bottom-right": { x: 1, y: 1 },
  bottom: { x: 0.5, y: 1 },
  center: { x: 0.5, y: 0.5 },
  left: { x: 0, y: 0.5 },
  right: { x: 1, y: 0.5 },
  "top-left": { x: 0, y: 0 },
  "top-right": { x: 1, y: 0 },
  top: { x: 0.5, y: 0 },
};

function canvasAnchorOffset(
  anchor: DrawingCanvasAnchor,
  widthDelta: number,
  heightDelta: number,
): { x: number; y: number } {
  const factor = DRAWING_CANVAS_ANCHOR_FACTORS[anchor];
  return { x: widthDelta * factor.x, y: heightDelta * factor.y };
}

function isDrawingCanvasDimension(value: number): boolean {
  return (
    Number.isInteger(value) &&
    value >= DRAWING_CANVAS_MIN_SIZE &&
    value <= DRAWING_CANVAS_MAX_SIZE
  );
}

function isSceneObject(
  scene: WorkspaceSectionData,
): scene is { [key: string]: WorkspaceSectionData } {
  return scene !== null && typeof scene === "object" && !Array.isArray(scene);
}

export class RealtimeDrawingRuntime {
  public readonly canvas: Canvas;
  public tool: DrawingTool = "draw";
  private readonly background: string;
  private availableHeight: number | null = null;
  private availableWidth: number | null = null;
  private asyncOperation: DrawingAsyncOperation | null = null;
  private asyncOperationRevision = 0;
  private clipboard: ReadonlyArray<DrawingSerializedObject> = [];
  private clipboardPasteCount = 0;
  private clipboardRevision = 0;
  private disposed = false;
  private drawing = false;
  private erasing = false;
  private erasedInGesture = false;
  private history: DrawingHistoryEntry[] = [];
  private historyIndex = -1;
  private logicalHeight: number;
  private logicalWidth: number;
  private loading = false;
  private readonly pen: BrushSettings = { color: "#111827", width: 4 };
  private readonly highlighter: BrushSettings = {
    color: "#facc15",
    width: 18,
  };
  private readonly onHistoryChange: (state: DrawingHistoryState) => void;
  private readonly onPreview: () => void;
  private readonly onSettled: () => void;
  private readonly renderOnAddRemove: boolean;
  private sceneLoad: AbortController | null = null;
  private selectionSnapshot: DrawingSelectionSnapshot;
  private selectionSnapshotKey = "";
  private readonly selectionSubscribers = new Set<() => void>();

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
      uniformScaling: false,
      width: options.width,
    });
    const brush = new PencilBrush(this.canvas);
    brush.color = this.pen.color;
    brush.limitedToCanvasSize = true;
    brush.width = this.pen.width;
    this.canvas.freeDrawingBrush = brush;
    this.renderOnAddRemove = this.canvas.renderOnAddRemove;
    this.selectionSnapshot = createDrawingSelectionSnapshot(this.canvas, {
      canPaste: false,
    });
    this.selectionSnapshotKey = JSON.stringify(this.selectionSnapshot);
    this.canvas.on("path:created", this.handleSettled);
    this.canvas.on("object:modified", this.handleObjectModified);
    this.canvas.on("selection:created", this.handleSelectionChanged);
    this.canvas.on("selection:updated", this.handleSelectionChanged);
    this.canvas.on("selection:cleared", this.handleSelectionChanged);
    this.canvas.on("text:changed", this.handleTextChanged);
    this.canvas.on("text:editing:exited", this.handleTextEditingExited);
    this.canvas.on("mouse:down", this.handlePointerStart);
    this.canvas.on("mouse:move", this.handlePointerMove);
    this.canvas.on("mouse:up", this.handlePointerEnd);
    this.setTool("draw");
    this.history = [this.createHistoryEntry()];
    this.historyIndex = 0;
    this.publishHistoryState();
  }

  public getSelectionSnapshot(): DrawingSelectionSnapshot {
    return this.selectionSnapshot;
  }

  public subscribeSelection(subscriber: () => void): () => void {
    this.selectionSubscribers.add(subscriber);
    return () => this.selectionSubscribers.delete(subscriber);
  }

  public setTool(tool: DrawingTool): void {
    this.tool = tool;
    this.configureBrush();
    this.canvas.isDrawingMode = tool === "draw" || tool === "highlighter";
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
    const position = this.nextObjectPosition(112, 72);
    const object = new Rect({
      fill: "rgba(37, 99, 235, 0.12)",
      height: 72,
      left: position.x,
      stroke: "#2563eb",
      strokeWidth: 2,
      top: position.y,
      width: 112,
    });
    return this.addCreatedObject(object);
  }

  public addEllipse(): FabricObject {
    const position = this.nextObjectPosition(108, 76);
    const object = new Ellipse({
      fill: "rgba(37, 99, 235, 0.12)",
      left: position.x,
      rx: 54,
      ry: 38,
      stroke: "#2563eb",
      strokeWidth: 2,
      top: position.y,
    });
    return this.addCreatedObject(object);
  }

  public addText(): Textbox {
    const position = this.nextObjectPosition(180, 48);
    const object = new Textbox("Text", {
      fill: "#111827",
      fontFamily: "Arial",
      fontSize: 28,
      left: position.x,
      top: position.y,
      width: 180,
    });
    this.canvas.add(object);
    this.setTool("select");
    this.canvas.setActiveObject(object);
    object.enterEditing();
    object.selectAll();
    this.canvas.requestRenderAll();
    this.publishSelectionState();
    this.previewLocalChange();
    return object;
  }

  public addLine(): Line {
    const position = this.nextObjectPosition(120, 2);
    return this.addCreatedObject(
      new Line([0, 0, 120, 0], {
        left: position.x,
        stroke: "#111827",
        strokeLineCap: "round",
        strokeWidth: 3,
        top: position.y,
      }),
    );
  }

  public addArrow(): Polyline {
    const position = this.nextObjectPosition(120, 28);
    return this.addCreatedObject(
      new Polyline(
        [
          { x: 0, y: 14 },
          { x: 120, y: 14 },
          { x: 98, y: 0 },
          { x: 120, y: 14 },
          { x: 98, y: 28 },
        ],
        {
          fill: null,
          left: position.x,
          stroke: "#111827",
          strokeLineCap: "round",
          strokeLineJoin: "round",
          strokeWidth: 3,
          top: position.y,
        },
      ),
    );
  }

  public addFilteredImage(
    source: HTMLCanvasElement,
    imageFilters: FabricImage["filters"],
  ): FabricImage {
    const image = new FabricImage(source, { left: 24, top: 24 });
    image.filters = [...imageFilters];
    image.applyFilters();
    return this.addCreatedObject(image);
  }

  public eraseObject(object: FabricObject): boolean {
    if (!this.canvas.contains(object) || isDrawingObjectLocked(object)) {
      return false;
    }
    this.canvas.remove(object);
    this.canvas.requestRenderAll();
    return true;
  }

  public clear(): boolean {
    const objects = this.canvas
      .getObjects()
      .filter((object) => !isDrawingObjectLocked(object));
    if (objects.length === 0) {
      return false;
    }
    this.canvas.discardActiveObject();
    this.canvas.remove(...objects);
    this.canvas.requestRenderAll();
    this.recordSettledChange();
    return true;
  }

  public deleteSelection(): boolean {
    const objects = selectedDrawingObjects(this.canvas);
    if (
      objects.length === 0 ||
      objects.some((object) => isDrawingObjectLocked(object))
    ) {
      return false;
    }
    this.canvas.discardActiveObject();
    this.canvas.remove(...objects);
    this.canvas.requestRenderAll();
    this.recordSettledChange();
    return true;
  }

  public setBrush(color: string, width: number): void {
    if (color.trim().length === 0 || !Number.isFinite(width) || width <= 0) {
      return;
    }
    const settings = this.tool === "highlighter" ? this.highlighter : this.pen;
    settings.color = color;
    settings.width = width;
    this.configureBrush();
  }

  public setSelectionAppearance(
    patch: DrawingSelectionAppearancePatch,
  ): boolean {
    const changed = applyDrawingAppearance(
      selectedDrawingObjects(this.canvas),
      patch,
    );
    return this.finishSelectionMutation(changed);
  }

  public setSelectionTypography(
    patch: DrawingSelectionTypographyPatch,
  ): boolean {
    const changed = applyDrawingTypography(
      selectedDrawingObjects(this.canvas),
      patch,
    );
    return this.finishSelectionMutation(changed);
  }

  public toggleSelectionLock(): boolean {
    const objects = selectedDrawingObjects(this.canvas);
    if (objects.length === 0) {
      return false;
    }
    const lock = !objects.every(isDrawingObjectLocked);
    return this.finishSelectionMutation(setDrawingObjectsLocked(objects, lock));
  }

  public bringSelectionForward(): boolean {
    return this.arrangeSelection("forward");
  }

  public sendSelectionBackward(): boolean {
    return this.arrangeSelection("backward");
  }

  public bringSelectionToFront(): boolean {
    return this.arrangeSelection("front");
  }

  public sendSelectionToBack(): boolean {
    return this.arrangeSelection("back");
  }

  public alignSelection(alignment: DrawingAlignment): boolean {
    const objects = this.unlockedSelection(2);
    if (objects === null) {
      return false;
    }
    this.canvas.discardActiveObject();
    const changed = alignDrawingObjects(objects, alignment);
    restoreDrawingSelection(this.canvas, objects);
    return this.finishSelectionMutation(changed);
  }

  public distributeSelection(distribution: DrawingDistribution): boolean {
    const objects = this.unlockedSelection(3);
    if (objects === null) {
      return false;
    }
    this.canvas.discardActiveObject();
    const changed = distributeDrawingObjects(objects, distribution);
    restoreDrawingSelection(this.canvas, objects);
    return this.finishSelectionMutation(changed);
  }

  public groupSelection(): boolean {
    const objects = this.unlockedSelection(2);
    if (objects === null) {
      return false;
    }
    const canvasObjects = this.canvas.getObjects();
    const selected = new Set(objects);
    const ordered = canvasObjects.filter((object) => selected.has(object));
    const indices = ordered.map((object) => canvasObjects.indexOf(object));
    const targetIndex = Math.max(...indices) - ordered.length + 1;
    this.canvas.discardActiveObject();
    this.canvas.remove(...ordered);
    const group = new Group(ordered);
    this.canvas.insertAt(targetIndex, group);
    this.canvas.setActiveObject(group);
    return this.finishSelectionMutation(true);
  }

  public ungroupSelection(): boolean {
    const objects = this.unlockedSelection(1);
    const group = objects?.[0];
    if (!(group instanceof Group)) {
      return false;
    }
    const index = this.canvas.getObjects().indexOf(group);
    this.canvas.discardActiveObject();
    const children = group.removeAll();
    this.canvas.remove(group);
    this.canvas.insertAt(index, ...children);
    restoreDrawingSelection(this.canvas, children);
    return this.finishSelectionMutation(children.length > 0);
  }

  public async duplicateSelection(): Promise<boolean> {
    const source = this.unlockedSelection(1);
    if (source === null) {
      return false;
    }
    const serialized = this.serializeObjects(source);
    const operation = this.beginAsyncOperation("duplicate");
    const objects = await this.enlivenObjects(serialized, operation);
    if (
      objects === null ||
      !this.isCurrentOperation(operation) ||
      !this.selectionMatches(source)
    ) {
      if (this.isCurrentOperation(operation)) {
        this.cancelAsyncOperation();
      }
      return false;
    }
    this.completeAsyncOperation(operation);
    return this.installObjects(objects, DRAWING_OBJECT_OFFSET);
  }

  public copySelection(): boolean {
    const objects = selectedDrawingObjects(this.canvas);
    if (objects.length === 0) {
      return false;
    }
    this.cancelAsyncOperation();
    this.clipboard = Object.freeze(this.serializeObjects(objects));
    this.clipboardPasteCount = 0;
    this.clipboardRevision += 1;
    this.publishSelectionState();
    return true;
  }

  public async pasteSelection(): Promise<boolean> {
    if (this.clipboard.length === 0) {
      return false;
    }
    const clipboard = this.clipboard;
    const clipboardRevision = this.clipboardRevision;
    const operation = this.beginAsyncOperation("paste");
    const objects = await this.enlivenObjects(clipboard, operation);
    if (
      objects === null ||
      !this.isCurrentOperation(operation) ||
      clipboard !== this.clipboard ||
      clipboardRevision !== this.clipboardRevision
    ) {
      if (this.isCurrentOperation(operation)) {
        this.cancelAsyncOperation();
      }
      return false;
    }
    this.completeAsyncOperation(operation);
    this.clipboardPasteCount += 1;
    return this.installObjects(
      objects,
      DRAWING_OBJECT_OFFSET * this.clipboardPasteCount,
    );
  }

  public selectAll(): boolean {
    const objects = this.canvas.getObjects();
    if (objects.length === 0 || this.selectionMatches(objects)) {
      return false;
    }
    this.setTool("select");
    this.canvas.discardActiveObject();
    restoreDrawingSelection(this.canvas, objects);
    this.canvas.requestRenderAll();
    this.publishSelectionState();
    return true;
  }

  public clearSelection(): boolean {
    if (selectedDrawingObjects(this.canvas).length === 0) {
      return false;
    }
    this.canvas.discardActiveObject();
    this.canvas.requestRenderAll();
    this.publishSelectionState();
    return true;
  }

  public nudgeSelection(x: number, y: number): boolean {
    const objects = this.unlockedSelection(1);
    if (
      objects === null ||
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      (x === 0 && y === 0)
    ) {
      return false;
    }
    this.canvas.discardActiveObject();
    for (const object of objects) {
      object.set({ left: object.left + x, top: object.top + y });
      object.setCoords();
    }
    restoreDrawingSelection(this.canvas, objects);
    return this.finishSelectionMutation(true);
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
    this.availableWidth = availableWidth;
    this.availableHeight = availableHeight;
    this.applyDisplaySize();
  }

  public getLogicalSize(): { height: number; width: number } {
    return { height: this.logicalHeight, width: this.logicalWidth };
  }

  public resizeCanvas(request: DrawingCanvasResizeRequest): boolean {
    if (
      this.loading ||
      !isDrawingCanvasDimension(request.width) ||
      !isDrawingCanvasDimension(request.height) ||
      (request.width === this.logicalWidth &&
        request.height === this.logicalHeight)
    ) {
      return false;
    }
    const previousWidth = this.logicalWidth;
    const previousHeight = this.logicalHeight;
    if (request.mode === "scale-artwork") {
      this.scaleArtwork(
        request.width / previousWidth,
        request.height / previousHeight,
      );
    } else {
      const offset = canvasAnchorOffset(
        request.anchor,
        request.width - previousWidth,
        request.height - previousHeight,
      );
      this.translateArtwork(offset.x, offset.y);
    }
    this.setLogicalSize(request.width, request.height);
    this.recordSettledChange();
    return true;
  }

  private applyDisplaySize(): void {
    const availableWidth = this.availableWidth;
    const availableHeight = this.availableHeight;
    if (availableWidth === null || availableHeight === null) {
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
    await this.applyHistoryEntry(this.history[this.historyIndex]!);
    this.publishHistoryState();
    this.notifySettled();
    return true;
  }

  public async redo(): Promise<boolean> {
    if (this.historyIndex >= this.history.length - 1) {
      return false;
    }
    this.historyIndex += 1;
    await this.applyHistoryEntry(this.history[this.historyIndex]!);
    this.publishHistoryState();
    this.notifySettled();
    return true;
  }

  public async loadScene(scene: WorkspaceSectionData): Promise<boolean> {
    if (!(await this.applyScene(scene))) {
      return false;
    }
    this.history = [this.createHistoryEntry()];
    this.historyIndex = 0;
    this.publishHistoryState();
    return true;
  }

  public async loadDocument(document: DrawingCanvasDocument): Promise<boolean> {
    if (!(await this.applyDocument(document))) {
      return false;
    }
    this.history = [this.createHistoryEntry()];
    this.historyIndex = 0;
    this.publishHistoryState();
    return true;
  }

  private async applyScene(scene: WorkspaceSectionData): Promise<boolean> {
    this.cancelAsyncOperation();
    this.sceneLoad?.abort();
    const controller = new AbortController();
    this.sceneLoad = controller;
    this.loading = true;
    this.canvas.isDrawingMode = false;
    this.canvas.selection = false;
    this.canvas.skipTargetFind = true;
    try {
      if (isSceneObject(scene)) {
        await this.canvas.loadFromJSON(scene, undefined, {
          signal: controller.signal,
        });
      } else {
        this.canvas.clear();
      }
      if (this.sceneLoad !== controller) {
        return false;
      }
      this.canvas.backgroundColor = this.background;
      return true;
    } catch (error) {
      if (this.sceneLoad === controller && !controller.signal.aborted) {
        throw error;
      }
      return false;
    } finally {
      if (this.sceneLoad === controller) {
        this.loading = false;
        this.sceneLoad = null;
        this.canvas.renderOnAddRemove = this.renderOnAddRemove;
        this.canvas.skipTargetFind = false;
        this.setTool(this.tool);
        this.canvas.renderAll();
        this.publishSelectionState();
      }
    }
  }

  public toScene(): WorkspaceSectionData {
    return this.canvas.toObject([
      ...DRAWING_OBJECT_SERIALIZATION_PROPERTIES,
    ]) as WorkspaceSectionData;
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
    return {
      blob,
      height: this.logicalHeight,
      scene,
      width: this.logicalWidth,
    };
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
    return {
      blob,
      height: this.logicalHeight,
      scene: this.toScene(),
      width: this.logicalWidth,
    };
  }

  public async dispose(): Promise<void> {
    this.disposed = true;
    this.cancelAsyncOperation();
    this.sceneLoad?.abort();
    this.sceneLoad = null;
    this.selectionSubscribers.clear();
    await this.canvas.dispose();
  }

  private readonly notifySettled = (): void => {
    if (!this.loading && !this.disposed) {
      this.onSettled();
    }
  };

  private readonly handleSettled = (): void => {
    this.recordSettledChange();
  };

  private readonly handleObjectModified = (): void => {
    this.recordSettledChange();
    this.publishSelectionState();
  };

  private readonly handleSelectionChanged = (): void => {
    if (this.asyncOperation?.kind === "duplicate") {
      this.cancelAsyncOperation();
    }
    this.publishSelectionState();
  };

  private readonly handleTextChanged = (): void => {
    this.previewLocalChange();
  };

  private readonly handleTextEditingExited = (): void => {
    this.recordSettledChange();
  };

  private previewLocalChange(): void {
    if (this.loading || this.disposed) {
      return;
    }
    this.cancelAsyncOperation();
    this.onPreview();
  }

  private recordSettledChange(): void {
    if (this.loading || this.disposed) {
      return;
    }
    this.cancelAsyncOperation();
    this.canvas.renderAll();
    const entry = this.createHistoryEntry();
    const current = this.history[this.historyIndex];
    if (
      current !== undefined &&
      JSON.stringify(current) === JSON.stringify(entry)
    ) {
      this.publishSelectionState();
      return;
    }
    this.history = this.history.slice(0, this.historyIndex + 1);
    this.history.push(entry);
    this.historyIndex = this.history.length - 1;
    this.publishHistoryState();
    this.publishSelectionState();
    this.notifySettled();
  }

  private createHistoryEntry(): DrawingHistoryEntry {
    return {
      height: this.logicalHeight,
      scene: this.toScene(),
      width: this.logicalWidth,
    };
  }

  private async applyHistoryEntry(entry: DrawingHistoryEntry): Promise<void> {
    await this.applyDocument(entry);
  }

  private async applyDocument(
    document: DrawingCanvasDocument,
  ): Promise<boolean> {
    this.setLogicalSize(document.width, document.height);
    return this.applyScene(document.scene);
  }

  private setLogicalSize(width: number, height: number): void {
    this.logicalWidth = width;
    this.logicalHeight = height;
    this.canvas.setDimensions({ height, width });
    this.applyDisplaySize();
  }

  private translateArtwork(x: number, y: number): void {
    for (const object of this.canvas.getObjects()) {
      object.set({ left: object.left + x, top: object.top + y });
      object.setCoords();
    }
  }

  private scaleArtwork(scaleX: number, scaleY: number): void {
    for (const object of this.canvas.getObjects()) {
      object.set({
        left: object.left * scaleX,
        scaleX: object.scaleX * scaleX,
        scaleY: object.scaleY * scaleY,
        top: object.top * scaleY,
      });
      object.setCoords();
    }
  }

  private nextObjectPosition(
    objectWidth: number,
    objectHeight: number,
  ): { x: number; y: number } {
    const offset =
      (this.canvas.getObjects().length % 12) * DRAWING_OBJECT_OFFSET;
    return {
      x: Math.max(0, Math.min(32 + offset, this.logicalWidth - objectWidth)),
      y: Math.max(0, Math.min(32 + offset, this.logicalHeight - objectHeight)),
    };
  }

  private addCreatedObject<ObjectType extends FabricObject>(
    object: ObjectType,
  ): ObjectType {
    this.canvas.add(object);
    this.setTool("select");
    this.canvas.setActiveObject(object);
    this.finishSelectionMutation(true);
    return object;
  }

  private configureBrush(): void {
    const brush = this.canvas.freeDrawingBrush;
    if (!(brush instanceof PencilBrush)) {
      return;
    }
    const settings = this.tool === "highlighter" ? this.highlighter : this.pen;
    brush.color =
      this.tool === "highlighter"
        ? new Color(settings.color).setAlpha(DRAWING_HIGHLIGHTER_ALPHA).toRgba()
        : settings.color;
    brush.decimate = 0.4;
    brush.limitedToCanvasSize = true;
    brush.straightLineKey = "shiftKey";
    brush.width = settings.width;
  }

  private finishSelectionMutation(changed: boolean): boolean {
    if (!changed || this.loading || this.disposed) {
      this.publishSelectionState();
      return false;
    }
    this.recordSettledChange();
    return true;
  }

  private unlockedSelection(minimum: number): FabricObject[] | null {
    const objects = selectedDrawingObjects(this.canvas);
    return !this.loading &&
      !this.disposed &&
      objects.length >= minimum &&
      objects.every((object) => !isDrawingObjectLocked(object))
      ? objects
      : null;
  }

  private arrangeSelection(
    action: "back" | "backward" | "forward" | "front",
  ): boolean {
    const objects = this.unlockedSelection(1);
    if (objects === null) {
      return false;
    }
    const selected = new Set(objects);
    const ordered = this.canvas
      .getObjects()
      .filter((object) => selected.has(object));
    let changed = false;
    if (action === "forward") {
      for (const object of [...ordered].reverse()) {
        changed = this.canvas.bringObjectForward(object) || changed;
      }
    } else if (action === "backward") {
      for (const object of ordered) {
        changed = this.canvas.sendObjectBackwards(object) || changed;
      }
    } else if (action === "front") {
      for (const object of ordered) {
        changed = this.canvas.bringObjectToFront(object) || changed;
      }
    } else {
      for (const object of [...ordered].reverse()) {
        changed = this.canvas.sendObjectToBack(object) || changed;
      }
    }
    return this.finishSelectionMutation(changed);
  }

  private serializeObjects(objects: FabricObject[]): DrawingSerializedObject[] {
    const selected = new Set(objects);
    const canvasObjects = this.canvas.getObjects();
    const scene = this.canvas.toObject([
      ...DRAWING_OBJECT_SERIALIZATION_PROPERTIES,
    ]) as unknown as {
      objects: DrawingSerializedObject[];
    };
    return canvasObjects.flatMap((object, index) => {
      const serialized = scene.objects[index];
      return selected.has(object) && serialized !== undefined
        ? [JSON.parse(JSON.stringify(serialized)) as DrawingSerializedObject]
        : [];
    });
  }

  private beginAsyncOperation(
    kind: DrawingAsyncOperation["kind"],
  ): DrawingAsyncOperation {
    this.cancelAsyncOperation();
    const operation = {
      controller: new AbortController(),
      kind,
      revision: ++this.asyncOperationRevision,
    };
    this.asyncOperation = operation;
    return operation;
  }

  private cancelAsyncOperation(): void {
    this.asyncOperation?.controller.abort();
    this.asyncOperation = null;
    this.asyncOperationRevision += 1;
  }

  private isCurrentOperation(operation: DrawingAsyncOperation): boolean {
    return (
      !this.disposed &&
      !this.loading &&
      this.asyncOperation === operation &&
      this.asyncOperationRevision === operation.revision &&
      !operation.controller.signal.aborted
    );
  }

  private completeAsyncOperation(operation: DrawingAsyncOperation): void {
    if (this.asyncOperation === operation) {
      this.asyncOperation = null;
    }
  }

  private async enlivenObjects(
    serialized: ReadonlyArray<DrawingSerializedObject>,
    operation: DrawingAsyncOperation,
  ): Promise<FabricObject[] | null> {
    try {
      return await util.enlivenObjects<FabricObject>([...serialized], {
        signal: operation.controller.signal,
      });
    } catch {
      return null;
    }
  }

  private installObjects(objects: FabricObject[], offset: number): boolean {
    if (objects.length === 0 || this.loading || this.disposed) {
      return false;
    }
    for (const object of objects) {
      object.set({ left: object.left + offset, top: object.top + offset });
      object.setCoords();
    }
    this.setTool("select");
    this.canvas.add(...objects);
    restoreDrawingSelection(this.canvas, objects);
    return this.finishSelectionMutation(true);
  }

  private selectionMatches(objects: FabricObject[]): boolean {
    const active = selectedDrawingObjects(this.canvas);
    const expected = new Set(objects);
    return (
      active.length === expected.size &&
      active.every((object) => expected.has(object))
    );
  }

  private publishSelectionState(): void {
    if (this.disposed) {
      return;
    }
    synchronizeDrawingSelectionLock(this.canvas);
    const snapshot = createDrawingSelectionSnapshot(this.canvas, {
      canPaste: this.clipboard.length > 0,
    });
    const key = JSON.stringify(snapshot);
    if (key === this.selectionSnapshotKey) {
      return;
    }
    this.selectionSnapshot = snapshot;
    this.selectionSnapshotKey = key;
    for (const subscriber of this.selectionSubscribers) {
      subscriber();
    }
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
    if (this.tool === "draw" || this.tool === "highlighter") {
      this.drawing = true;
    } else if (this.tool === "erase") {
      this.erasing = true;
      this.erasedInGesture = this.eraseTarget(event);
      if (this.erasedInGesture) {
        this.previewLocalChange();
      }
    }
  };

  private readonly handlePointerMove = (event: TPointerEventInfo): void => {
    if ((this.tool === "draw" || this.tool === "highlighter") && this.drawing) {
      this.previewLocalChange();
    } else if (this.tool === "erase" && this.erasing) {
      const erased = this.eraseTarget(event);
      this.erasedInGesture = erased || this.erasedInGesture;
      if (erased) {
        this.previewLocalChange();
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
