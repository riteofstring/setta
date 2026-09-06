import {
  Canvas,
  PencilBrush,
  Rect,
  type FabricObject,
  type TPointerEventInfo,
} from "fabric";
import type { WorkspaceSectionData } from "@setta/workspace";

export type DrawingTool = "select" | "draw" | "erase";

type DrawingRuntimeOptions = {
  background: string;
  height: number;
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
  public tool: DrawingTool = "select";
  private readonly background: string;
  private erasing = false;
  private erasedInGesture = false;
  private loading = false;
  private readonly onSettled: () => void;
  private sceneLoad: AbortController | null = null;

  public constructor(
    element: HTMLCanvasElement,
    options: DrawingRuntimeOptions,
  ) {
    this.background = options.background;
    this.onSettled = options.onSettled;
    this.canvas = new Canvas(element, {
      backgroundColor: options.background,
      height: options.height,
      preserveObjectStacking: true,
      selection: true,
      width: options.width,
    });
    const brush = new PencilBrush(this.canvas);
    brush.color = "#111827";
    brush.width = 3;
    this.canvas.freeDrawingBrush = brush;
    this.canvas.on("path:created", this.handleSettled);
    this.canvas.on("object:modified", this.handleSettled);
    this.canvas.on("mouse:down", this.handleEraseStart);
    this.canvas.on("mouse:move", this.handleEraseMove);
    this.canvas.on("mouse:up", this.handleEraseEnd);
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
    this.notifySettled();
    return object;
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
    this.notifySettled();
  }

  public async loadScene(scene: WorkspaceSectionData): Promise<void> {
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
    this.notifySettled();
  };

  private eraseTarget(event: TPointerEventInfo): boolean {
    const target = event.target ?? this.canvas.findTarget(event.e).target;
    return target === undefined ? false : this.eraseObject(target);
  }

  private readonly handleEraseStart = (event: TPointerEventInfo): void => {
    if (this.tool !== "erase") {
      return;
    }
    this.erasing = true;
    this.erasedInGesture = this.eraseTarget(event);
  };

  private readonly handleEraseMove = (event: TPointerEventInfo): void => {
    if (this.tool === "erase" && this.erasing) {
      this.erasedInGesture = this.eraseTarget(event) || this.erasedInGesture;
    }
  };

  private readonly handleEraseEnd = (): void => {
    if (!this.erasing) {
      return;
    }
    this.erasing = false;
    if (this.erasedInGesture) {
      this.notifySettled();
    }
    this.erasedInGesture = false;
  };
}
