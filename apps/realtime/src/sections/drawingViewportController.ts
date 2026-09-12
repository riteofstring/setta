import type { Canvas } from "fabric";

import {
  clampDrawingGridSpacing,
  DRAWING_GRID_DEFAULT_SPACING,
} from "./drawingGrid";
import {
  actualSizeDrawingViewport,
  createDrawingViewport,
  fitDrawingViewport,
  getDrawingViewportPresentation,
  panDrawingViewport,
  resizeDrawingViewportLogical,
  resizeDrawingViewportStage,
  stepDrawingViewportZoom,
  type DrawingViewportPoint,
  type DrawingViewportPresentation,
  type DrawingViewportSize,
  type DrawingViewportSnapshot,
} from "./drawingViewport";

export type DrawingViewportGridOptions = Readonly<{
  spacing: number;
  visible: boolean;
}>;

export type DrawingViewportChangeListener = (
  presentation: DrawingViewportPresentation,
) => void;

function cssPixels(value: number): string {
  return `${Object.is(value, -0) ? 0 : value}px`;
}

function presentationsMatch(
  left: DrawingViewportPresentation,
  right: DrawingViewportPresentation,
): boolean {
  return (
    left.canZoomIn === right.canZoomIn &&
    left.canZoomOut === right.canZoomOut &&
    left.displayHeight === right.displayHeight &&
    left.displayWidth === right.displayWidth &&
    left.maximumPanX === right.maximumPanX &&
    left.maximumPanY === right.maximumPanY &&
    left.mode === right.mode &&
    left.panX === right.panX &&
    left.panY === right.panY &&
    left.scale === right.scale &&
    left.zoomPercent === right.zoomPercent
  );
}

export class DrawingViewportController {
  private readonly canvas: Canvas;
  private disposed = false;
  private readonly gridElement: HTMLDivElement;
  private gridSpacing = DRAWING_GRID_DEFAULT_SPACING;
  private gridVisible = false;
  private readonly onChange: DrawingViewportChangeListener;
  private presentation: DrawingViewportPresentation;
  private snapshot: DrawingViewportSnapshot;

  public constructor(
    canvas: Canvas,
    logicalSize: DrawingViewportSize,
    stageSize: DrawingViewportSize,
    onChange: DrawingViewportChangeListener,
  ) {
    this.canvas = canvas;
    this.onChange = onChange;
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
    this.onChange(this.presentation);
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

  public fit(): void {
    this.transition(fitDrawingViewport);
  }

  public actualSize(): void {
    this.transition(actualSizeDrawingViewport);
  }

  public zoomIn(): void {
    this.transition((snapshot) => stepDrawingViewportZoom(snapshot, "in"));
  }

  public zoomOut(): void {
    this.transition((snapshot) => stepDrawingViewportZoom(snapshot, "out"));
  }

  public panBy(delta: DrawingViewportPoint): void {
    this.transition((snapshot) => panDrawingViewport(snapshot, delta));
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
    const nextPresentation = getDrawingViewportPresentation(nextSnapshot);
    const changed = !presentationsMatch(this.presentation, nextPresentation);
    if (changed) {
      this.presentation = nextPresentation;
    }
    this.applyPresentation();
    if (changed) {
      this.onChange(this.presentation);
    }
  }

  private applyPresentation(): void {
    this.canvas.setDimensions(
      {
        height: cssPixels(this.presentation.displayHeight),
        width: cssPixels(this.presentation.displayWidth),
      },
      { cssOnly: true },
    );
    this.canvas.wrapperEl.style.transform = `translate(${cssPixels(
      this.presentation.panX,
    )}, ${cssPixels(this.presentation.panY)})`;
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
