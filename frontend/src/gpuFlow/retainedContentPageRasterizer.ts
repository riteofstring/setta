import {
  drawGpuRetainedContentCommand,
  drawGpuRetainedContentPortAnchors,
} from "./retainedContentCanvasCommands";
import type { GpuRetainedContentCanvasPalette } from "./retainedContentCanvasTheme";
import type {
  GpuRetainedContentDrawCommand,
  GpuRetainedContentScene,
} from "./retainedContentScene";
import type { GpuRetainedContentSwitchAnimationStore } from "./retainedContentSwitchAnimation";
import type { GpuRect } from "./viewportMath";

export type GpuRetainedContentPageRasterPlan = {
  readonly pixelHeight: number;
  readonly pixelWidth: number;
  readonly sourceRectCss: GpuRect;
  readonly transform: {
    readonly a: number;
    readonly b: 0;
    readonly c: 0;
    readonly d: number;
    readonly e: number;
    readonly f: number;
  };
};

export type RasterizeGpuRetainedContentPageInput = {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  readonly lodScale: number;
  readonly nowMs?: number | undefined;
  readonly palette: GpuRetainedContentCanvasPalette;
  readonly scene: GpuRetainedContentScene;
  readonly sourceRectCss: GpuRect;
  readonly surfaceId: string;
  readonly switchAnimations?:
    | GpuRetainedContentSwitchAnimationStore
    | undefined;
};

export type RasterizeGpuRetainedContentPageResult = {
  readonly drawnCommandCount: number;
  readonly plan: GpuRetainedContentPageRasterPlan;
};

export function rasterizeGpuRetainedContentPage({
  canvas,
  ctx,
  lodScale,
  nowMs,
  palette,
  scene,
  sourceRectCss,
  surfaceId,
  switchAnimations,
}: RasterizeGpuRetainedContentPageInput): RasterizeGpuRetainedContentPageResult {
  const plan = createGpuRetainedContentPageRasterPlan({
    lodScale,
    sourceRectCss,
  });
  if (canvas.width !== plan.pixelWidth) {
    canvas.width = plan.pixelWidth;
  }
  if (canvas.height !== plan.pixelHeight) {
    canvas.height = plan.pixelHeight;
  }

  const rowStateById = new Map(scene.rows.map((row) => [row.id, row.state]));
  const commands = filterGpuRetainedContentDrawCommandsForPage({
    commands: scene.drawCommands,
    sourceRectCss: plan.sourceRectCss,
  });

  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, plan.pixelWidth, plan.pixelHeight);
  ctx.setTransform(
    plan.transform.a,
    plan.transform.b,
    plan.transform.c,
    plan.transform.d,
    plan.transform.e,
    plan.transform.f,
  );
  ctx.beginPath();
  ctx.rect(
    plan.sourceRectCss.x,
    plan.sourceRectCss.y,
    plan.sourceRectCss.width,
    plan.sourceRectCss.height,
  );
  ctx.clip();
  ctx.fillStyle = palette.surfaceBackground;
  ctx.fillRect(
    plan.sourceRectCss.x,
    plan.sourceRectCss.y,
    plan.sourceRectCss.width,
    plan.sourceRectCss.height,
  );

  for (const command of commands) {
    drawGpuRetainedContentCommand({
      command,
      ctx,
      nowMs,
      palette,
      rowState: rowStateById.get(command.rowId),
      surfaceId,
      switchAnimations,
    });
  }
  drawGpuRetainedContentPortAnchors(ctx, scene);
  ctx.restore();

  return {
    drawnCommandCount: commands.length,
    plan,
  };
}

export function createGpuRetainedContentPageRasterPlan({
  lodScale,
  sourceRectCss,
}: {
  readonly lodScale: number;
  readonly sourceRectCss: GpuRect;
}): GpuRetainedContentPageRasterPlan {
  const normalizedSourceRect = normalizeRect("sourceRectCss", sourceRectCss);
  const normalizedLodScale = normalizeFinitePositiveNumber(
    "lodScale",
    lodScale,
  );
  return {
    pixelHeight: Math.max(
      1,
      Math.ceil(normalizedSourceRect.height * normalizedLodScale),
    ),
    pixelWidth: Math.max(
      1,
      Math.ceil(normalizedSourceRect.width * normalizedLodScale),
    ),
    sourceRectCss: normalizedSourceRect,
    transform: {
      a: normalizedLodScale,
      b: 0,
      c: 0,
      d: normalizedLodScale,
      e: -normalizedSourceRect.x * normalizedLodScale,
      f: -normalizedSourceRect.y * normalizedLodScale,
    },
  };
}

export function filterGpuRetainedContentDrawCommandsForPage({
  commands,
  sourceRectCss,
}: {
  readonly commands: readonly GpuRetainedContentDrawCommand[];
  readonly sourceRectCss: GpuRect;
}): readonly GpuRetainedContentDrawCommand[] {
  const normalizedSourceRect = normalizeRect("sourceRectCss", sourceRectCss);
  return commands.filter(
    (command) =>
      command.kind !== "scrollbar" &&
      rectsIntersect(
        getGpuRetainedContentDrawCommandBounds(command),
        normalizedSourceRect,
      ),
  );
}

export function getGpuRetainedContentDrawCommandBounds(
  command: GpuRetainedContentDrawCommand,
): GpuRect {
  if (command.kind === "scrollbar") {
    throw new Error("Retained scrollbars are overlay-owned, not page-rasterized.");
  }
  return command.rect;
}

function rectsIntersect(left: GpuRect, right: GpuRect): boolean {
  return (
    left.x < right.x + right.width &&
    left.x + left.width > right.x &&
    left.y < right.y + right.height &&
    left.y + left.height > right.y
  );
}

function normalizeRect(name: string, rect: GpuRect): GpuRect {
  const x = normalizeFiniteNumber(`${name}.x`, rect.x);
  const y = normalizeFiniteNumber(`${name}.y`, rect.y);
  const width = normalizeFinitePositiveNumber(`${name}.width`, rect.width);
  const height = normalizeFinitePositiveNumber(`${name}.height`, rect.height);
  return { height, width, x, y };
}

function normalizeFiniteNumber(name: string, value: number): number {
  if (!Number.isFinite(value)) {
    throw new Error(`Retained content page raster ${name} must be finite.`);
  }
  return value;
}

function normalizeFinitePositiveNumber(name: string, value: number): number {
  const normalized = normalizeFiniteNumber(name, value);
  if (normalized <= 0) {
    throw new Error(
      `Retained content page raster ${name} must be greater than zero.`,
    );
  }
  return normalized;
}
