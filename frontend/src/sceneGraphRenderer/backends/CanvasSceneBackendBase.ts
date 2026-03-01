import type { SceneGraphRendererCapabilities } from "sceneGraphRenderer/capabilities";
import type {
  SceneGraphCamera,
  SceneGraphFrameState,
  SceneGraphRenderSnapshot,
  SceneGraphRenderSnapshotDiff,
} from "sceneGraphRenderer/types";
import type { RendererBackend } from "./RendererBackend";

export abstract class CanvasSceneBackendBase implements RendererBackend {
  private canvas: HTMLCanvasElement | null = null;
  private context: CanvasRenderingContext2D | null = null;

  init(
    canvas: HTMLCanvasElement,
    _capabilities: SceneGraphRendererCapabilities,
  ): void {
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("Scene graph renderer requires a 2D canvas context.");
    }
    this.canvas = canvas;
    this.context = context;
  }

  updateResources(_diff: SceneGraphRenderSnapshotDiff): void {}

  render(
    snapshot: SceneGraphRenderSnapshot,
    camera: SceneGraphCamera,
    frameState: SceneGraphFrameState,
  ): void {
    if (!this.canvas || !this.context) {
      return;
    }

    resizeCanvas(this.canvas, camera);
    const context = this.context;
    context.setTransform(
      camera.devicePixelRatio,
      0,
      0,
      camera.devicePixelRatio,
      0,
      0,
    );
    context.clearRect(0, 0, camera.viewportWidth, camera.viewportHeight);

    drawEdges(context, snapshot, camera, frameState);
    drawSections(context, snapshot, camera, frameState);

    if (frameState.debugOverlay) {
      drawDebugOverlay(context, this.getDebugLabel(), snapshot, frameState);
    }
  }

  dispose(): void {
    if (this.canvas && this.context) {
      this.context.setTransform(1, 0, 0, 1, 0, 0);
      this.context.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }
    this.canvas = null;
    this.context = null;
  }

  protected abstract getDebugLabel(): string;
}

function resizeCanvas(
  canvas: HTMLCanvasElement,
  camera: SceneGraphCamera,
): void {
  const targetPixelWidth = Math.max(
    1,
    Math.round(camera.viewportWidth * camera.devicePixelRatio),
  );
  const targetPixelHeight = Math.max(
    1,
    Math.round(camera.viewportHeight * camera.devicePixelRatio),
  );
  if (
    canvas.width !== targetPixelWidth ||
    canvas.height !== targetPixelHeight
  ) {
    canvas.width = targetPixelWidth;
    canvas.height = targetPixelHeight;
  }
}

function drawEdges(
  context: CanvasRenderingContext2D,
  snapshot: SceneGraphRenderSnapshot,
  camera: SceneGraphCamera,
  frameState: SceneGraphFrameState,
): void {
  context.strokeStyle = frameState.wireColor;
  context.lineWidth = 1.25;
  context.globalAlpha = 0.85;

  for (const edge of snapshot.edges) {
    const sourceX = edge.sourceX * camera.zoom + camera.x;
    const sourceY = edge.sourceY * camera.zoom + camera.y;
    const targetX = edge.targetX * camera.zoom + camera.x;
    const targetY = edge.targetY * camera.zoom + camera.y;
    context.beginPath();
    context.moveTo(sourceX, sourceY);
    context.lineTo(targetX, targetY);
    context.stroke();
  }

  context.globalAlpha = 1;
}

function drawSections(
  context: CanvasRenderingContext2D,
  snapshot: SceneGraphRenderSnapshot,
  camera: SceneGraphCamera,
  frameState: SceneGraphFrameState,
): void {
  context.fillStyle = frameState.sectionFillColor;
  context.strokeStyle = frameState.sectionStrokeColor;
  context.lineWidth = 1;

  for (const section of snapshot.sections) {
    const x = section.x * camera.zoom + camera.x;
    const y = section.y * camera.zoom + camera.y;
    const width = section.width * camera.zoom;
    const height = section.height * camera.zoom;
    if (width <= 0 || height <= 0) {
      continue;
    }
    context.fillRect(x, y, width, height);
    context.strokeRect(x, y, width, height);
  }
}

function drawDebugOverlay(
  context: CanvasRenderingContext2D,
  debugLabel: string,
  snapshot: SceneGraphRenderSnapshot,
  frameState: SceneGraphFrameState,
): void {
  context.globalAlpha = 0.88;
  context.fillStyle = "rgba(2, 6, 23, 0.8)";
  context.fillRect(8, 8, 240, 64);
  context.globalAlpha = 1;
  context.fillStyle = "rgba(241, 245, 249, 0.95)";
  context.font = "12px monospace";
  context.fillText(`scene backend: ${debugLabel}`, 14, 26);
  context.fillText(
    `sections: ${snapshot.sections.length} edges: ${snapshot.edges.length}`,
    14,
    42,
  );
  context.fillText(`frame: ${frameState.frameNumber}`, 14, 58);
}
