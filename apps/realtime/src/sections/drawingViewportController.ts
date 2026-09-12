import type { Canvas } from "fabric";

import {
  clampDrawingGridSpacing,
  DRAWING_GRID_DEFAULT_SPACING,
} from "./drawingGrid";
import {
  createDrawingViewport,
  getDrawingViewportPresentation,
  resizeDrawingViewportLogical,
  resizeDrawingViewportStage,
  type DrawingViewportPresentation,
  type DrawingViewportSize,
  type DrawingViewportSnapshot,
} from "./drawingViewport";

type DrawingViewportGridOptions = Readonly<{
  spacing: number;
  visible: boolean;
}>;

function cssPixels(value: number): string {
  return `${Object.is(value, -0) ? 0 : value}px`;
}

export class DrawingViewportController {
  private readonly canvas: Canvas;
  private disposed = false;
  private readonly gridElement: HTMLDivElement;
  private gridSpacing = DRAWING_GRID_DEFAULT_SPACING;
  private gridVisible = false;
  private presentation: DrawingViewportPresentation;
  private snapshot: DrawingViewportSnapshot;

  public constructor(
    canvas: Canvas,
    logicalSize: DrawingViewportSize,
    stageSize: DrawingViewportSize,
  ) {
    this.canvas = canvas;
    this.snapshot = createDrawingViewport(logicalSize, stageSize);
    this.presentation = getDrawingViewportPresentation(this.snapshot);
    this.gridElement = document.createElement("div");
    this.gridElement.className = "realtime-drawing-grid";
    this.gridElement.setAttribute("aria-hidden", "true");
    this.gridElement.style.inset = "0";
    this.gridElement.style.pointerEvents = "none";
    this.gridElement.style.position = "absolute";
    this.canvas.wrapperEl.insertBefore(
      this.gridElement,
      this.canvas.upperCanvasEl,
    );
    this.applyPresentation();
  }

  public getPresentation(): DrawingViewportPresentation {
    return this.presentation;
  }

  public resizeStage(stageSize: DrawingViewportSize): void {
    this.transition((snapshot) =>
      resizeDrawingViewportStage(snapshot, stageSize),
    );
  }

  public resizeLogical(logicalSize: DrawingViewportSize): void {
    this.transition((snapshot) =>
      resizeDrawingViewportLogical(snapshot, logicalSize),
    );
  }

  public setGrid(options: DrawingViewportGridOptions): void {
    if (this.disposed) {
      return;
    }
    const spacing = clampDrawingGridSpacing(options.spacing);
    if (this.gridVisible === options.visible && this.gridSpacing === spacing) {
      return;
    }
    this.gridVisible = options.visible;
    this.gridSpacing = spacing;
    this.applyGridPresentation();
  }

  public dispose(): void {
    if (this.disposed) {
      return;
    }
    this.disposed = true;
    this.gridElement.remove();
  }

  private transition(
    update: (snapshot: DrawingViewportSnapshot) => DrawingViewportSnapshot,
  ): void {
    if (this.disposed) {
      return;
    }
    const nextSnapshot = update(this.snapshot);
    if (nextSnapshot === this.snapshot) {
      return;
    }
    this.snapshot = nextSnapshot;
    this.presentation = getDrawingViewportPresentation(nextSnapshot);
    this.applyPresentation();
  }

  private applyPresentation(): void {
    this.canvas.setDimensions(
      {
        height: cssPixels(this.presentation.displayHeight),
        width: cssPixels(this.presentation.displayWidth),
      },
      { cssOnly: true },
    );
    this.applyGridPresentation();
    this.canvas.calcOffset();
  }

  private applyGridPresentation(): void {
    const displaySpacing = this.gridSpacing * this.presentation.scale;
    const spacing = cssPixels(displaySpacing);
    this.gridElement.hidden =
      !this.gridVisible || this.presentation.scale === 0;
    this.gridElement.style.backgroundSize = `${spacing} ${spacing}`;
    this.gridElement.style.height = cssPixels(this.presentation.displayHeight);
    this.gridElement.style.setProperty(
      "--realtime-drawing-grid-spacing",
      spacing,
    );
    this.gridElement.style.width = cssPixels(this.presentation.displayWidth);
  }
}
