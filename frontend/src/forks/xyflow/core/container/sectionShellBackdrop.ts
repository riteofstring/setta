import type { Node, Rect } from "../types";

export type SectionShellBackdropFrame = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string | null;
  stroke: string | null;
  zIndex: number;
};

export type SectionShellBackdropScene = {
  bounds: Rect | null;
  frames: Array<SectionShellBackdropFrame>;
};

type SectionShellBackdropFrameVisual = {
  fill?: string | null;
  stroke?: string | null;
};

type BuildSectionShellBackdropSceneOptions = {
  getFrameVisual?: (node: Node) => SectionShellBackdropFrameVisual | null;
};

type PaintSectionShellBackdropOptions = {
  darkMode: boolean;
  padding?: number;
  cornerRadius?: number;
};

const LIGHT_BACKDROP_PALETTE = {
  fill: "rgba(255, 255, 255, 0.88)",
  stroke: "rgba(203, 213, 225, 0.92)",
  shadow: "rgba(15, 23, 42, 0.16)",
};

const DARK_BACKDROP_PALETTE = {
  fill: "rgba(15, 23, 42, 0.82)",
  stroke: "rgba(71, 85, 105, 0.9)",
  shadow: "rgba(2, 6, 23, 0.42)",
};

export function buildSectionShellBackdropScene(
  nodes: Iterable<Node>,
  { getFrameVisual }: BuildSectionShellBackdropSceneOptions = {},
): SectionShellBackdropScene {
  const frames: Array<SectionShellBackdropFrame> = [];
  let minX = Number.POSITIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (const node of nodes) {
    const x = node.position.x;
    const y = node.position.y;
    const width = node.width ?? 0;
    const height = node.height ?? 0;

    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      width <= 0 ||
      height <= 0
    ) {
      continue;
    }

    const frameVisual = getFrameVisual?.(node) ?? null;

    frames.push({
      id: node.id,
      x,
      y,
      width,
      height,
      fill:
        frameVisual?.fill ??
        (typeof node.style?.background === "string"
          ? node.style.background
          : null),
      stroke: frameVisual?.stroke ?? null,
      zIndex: node.tempZIndex ?? node.zIndex,
    });

    minX = Math.min(minX, x);
    minY = Math.min(minY, y);
    maxX = Math.max(maxX, x + width);
    maxY = Math.max(maxY, y + height);
  }

  frames.sort((a, b) => a.zIndex - b.zIndex);

  if (frames.length === 0) {
    return {
      bounds: null,
      frames,
    };
  }

  return {
    bounds: {
      x: minX,
      y: minY,
      width: maxX - minX,
      height: maxY - minY,
    },
    frames,
  };
}

export function expandSectionShellBackdropBounds(
  bounds: Rect,
  padding: number,
): Rect {
  return {
    x: bounds.x - padding,
    y: bounds.y - padding,
    width: bounds.width + padding * 2,
    height: bounds.height + padding * 2,
  };
}

function beginRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  if (typeof ctx.roundRect === "function") {
    ctx.roundRect(x, y, width, height, radius);
    return;
  }
  ctx.rect(x, y, width, height);
}

export function paintSectionShellBackdrop(
  ctx: CanvasRenderingContext2D,
  scene: SectionShellBackdropScene,
  {
    darkMode,
    padding = 24,
    cornerRadius = 16,
  }: PaintSectionShellBackdropOptions,
) {
  if (scene.bounds === null) {
    return;
  }

  const palette = darkMode ? DARK_BACKDROP_PALETTE : LIGHT_BACKDROP_PALETTE;
  const originX = scene.bounds.x - padding;
  const originY = scene.bounds.y - padding;

  ctx.lineWidth = darkMode ? 1.5 : 1;

  for (const frame of scene.frames) {
    const frameX = frame.x - originX;
    const frameY = frame.y - originY;

    ctx.shadowColor = palette.shadow;
    ctx.shadowBlur = darkMode ? 24 : 18;
    ctx.shadowOffsetY = darkMode ? 10 : 8;
    ctx.fillStyle = frame.fill ?? palette.fill;
    beginRoundedRect(
      ctx,
      frameX,
      frameY,
      frame.width,
      frame.height,
      cornerRadius,
    );
    ctx.fill();

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    ctx.strokeStyle = frame.stroke ?? palette.stroke;
    beginRoundedRect(
      ctx,
      frameX,
      frameY,
      frame.width,
      frame.height,
      cornerRadius,
    );
    ctx.stroke();
  }
}
