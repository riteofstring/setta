import type { Node, Rect } from "../types";

export type SectionShellBackdropFrameDetailBand = {
  cornerRadius: number;
  divider: string | null;
  fill: string | null;
  height: number;
  offsetY: number;
};

export type SectionShellBackdropFrameDetailBox = {
  cornerRadius: number;
  fill: string | null;
  height: number;
  width: number;
  x: number;
  y: number;
};

export type SectionShellBackdropFrameDetailText = {
  fill: string | null;
  font: string | null;
  maxWidth: number;
  text: string;
  x: number;
  y: number;
};

export type SectionShellBackdropFrame = {
  detailBands: Array<SectionShellBackdropFrameDetailBand>;
  detailBoxes: Array<SectionShellBackdropFrameDetailBox>;
  detailTexts: Array<SectionShellBackdropFrameDetailText>;
  headerDivider: string | null;
  headerFill: string | null;
  headerHeight: number;
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

type SectionShellBackdropFrameDetailBandVisual = {
  cornerRadius?: number | null;
  divider?: string | null;
  fill?: string | null;
  height: number;
  offsetY: number;
};

type SectionShellBackdropFrameDetailBoxVisual = {
  cornerRadius?: number | null;
  fill?: string | null;
  height: number;
  width: number;
  x: number;
  y: number;
};

type SectionShellBackdropFrameDetailTextVisual = {
  fill?: string | null;
  font?: string | null;
  maxWidth: number;
  text: string;
  x: number;
  y: number;
};

type SectionShellBackdropFrameVisual = {
  detailBands?: Array<SectionShellBackdropFrameDetailBandVisual> | null;
  detailBoxes?: Array<SectionShellBackdropFrameDetailBoxVisual> | null;
  detailTexts?: Array<SectionShellBackdropFrameDetailTextVisual> | null;
  fill?: string | null;
  headerDivider?: string | null;
  headerFill?: string | null;
  headerHeight?: number | null;
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

function normalizeDetailBands({
  detailBands,
  frameHeight,
  frameWidth,
}: {
  detailBands: Array<SectionShellBackdropFrameDetailBandVisual> | null;
  frameHeight: number;
  frameWidth: number;
}): Array<SectionShellBackdropFrameDetailBand> {
  if (!Array.isArray(detailBands) || detailBands.length === 0) {
    return [];
  }

  return detailBands
    .map((detailBand) => {
      const rawOffsetY = detailBand.offsetY;
      const rawHeight = detailBand.height;
      if (
        !Number.isFinite(rawOffsetY) ||
        !Number.isFinite(rawHeight) ||
        rawHeight <= 0
      ) {
        return null;
      }

      const offsetY = Math.max(0, Math.min(rawOffsetY, frameHeight));
      const maxHeight = frameHeight - offsetY;
      if (maxHeight <= 0) {
        return null;
      }

      const height = Math.max(0, Math.min(rawHeight, maxHeight));
      if (height <= 0) {
        return null;
      }

      const rawCornerRadius = detailBand.cornerRadius;
      const cornerRadius =
        typeof rawCornerRadius === "number" && Number.isFinite(rawCornerRadius)
          ? Math.max(0, Math.min(rawCornerRadius, height / 2, frameWidth / 2))
          : 0;

      return {
        cornerRadius,
        divider: detailBand.divider ?? null,
        fill: detailBand.fill ?? null,
        height,
        offsetY,
      };
    })
    .filter(
      (detailBand): detailBand is SectionShellBackdropFrameDetailBand =>
        detailBand !== null,
    )
    .sort((a, b) => a.offsetY - b.offsetY);
}

function normalizeDetailBoxes({
  detailBoxes,
  frameHeight,
  frameWidth,
}: {
  detailBoxes: Array<SectionShellBackdropFrameDetailBoxVisual> | null;
  frameHeight: number;
  frameWidth: number;
}): Array<SectionShellBackdropFrameDetailBox> {
  if (!Array.isArray(detailBoxes) || detailBoxes.length === 0) {
    return [];
  }

  return detailBoxes
    .map((detailBox) => {
      const rawX = detailBox.x;
      const rawY = detailBox.y;
      const rawWidth = detailBox.width;
      const rawHeight = detailBox.height;
      if (
        !Number.isFinite(rawX) ||
        !Number.isFinite(rawY) ||
        !Number.isFinite(rawWidth) ||
        !Number.isFinite(rawHeight) ||
        rawWidth <= 0 ||
        rawHeight <= 0
      ) {
        return null;
      }

      const x = Math.max(0, Math.min(rawX, frameWidth));
      const y = Math.max(0, Math.min(rawY, frameHeight));
      const maxWidth = frameWidth - x;
      const maxHeight = frameHeight - y;
      if (maxWidth <= 0 || maxHeight <= 0) {
        return null;
      }

      const width = Math.max(0, Math.min(rawWidth, maxWidth));
      const height = Math.max(0, Math.min(rawHeight, maxHeight));
      if (width <= 0 || height <= 0) {
        return null;
      }

      const rawCornerRadius = detailBox.cornerRadius;
      const cornerRadius =
        typeof rawCornerRadius === "number" && Number.isFinite(rawCornerRadius)
          ? Math.max(0, Math.min(rawCornerRadius, height / 2, width / 2))
          : 0;

      return {
        cornerRadius,
        fill: detailBox.fill ?? null,
        height,
        width,
        x,
        y,
      };
    })
    .filter(
      (detailBox): detailBox is SectionShellBackdropFrameDetailBox =>
        detailBox !== null,
    )
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

function normalizeDetailTexts({
  detailTexts,
  frameHeight,
  frameWidth,
}: {
  detailTexts: Array<SectionShellBackdropFrameDetailTextVisual> | null;
  frameHeight: number;
  frameWidth: number;
}): Array<SectionShellBackdropFrameDetailText> {
  if (!Array.isArray(detailTexts) || detailTexts.length === 0) {
    return [];
  }

  return detailTexts
    .map((detailText) => {
      const rawX = detailText.x;
      const rawY = detailText.y;
      const rawMaxWidth = detailText.maxWidth;
      const text = detailText.text;
      if (
        !Number.isFinite(rawX) ||
        !Number.isFinite(rawY) ||
        !Number.isFinite(rawMaxWidth) ||
        rawMaxWidth <= 0 ||
        typeof text !== "string" ||
        text.length === 0
      ) {
        return null;
      }

      const x = Math.max(0, Math.min(rawX, frameWidth));
      const y = Math.max(0, Math.min(rawY, frameHeight));
      const maxWidth = Math.max(0, Math.min(rawMaxWidth, frameWidth - x));
      if (maxWidth <= 0) {
        return null;
      }

      const font =
        typeof detailText.font === "string" && detailText.font.trim().length > 0
          ? detailText.font.trim()
          : null;

      return {
        fill: detailText.fill ?? null,
        font,
        maxWidth,
        text,
        x,
        y,
      };
    })
    .filter(
      (detailText): detailText is SectionShellBackdropFrameDetailText =>
        detailText !== null,
    )
    .sort((a, b) => a.y - b.y || a.x - b.x);
}

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
    const rawHeaderHeight = frameVisual?.headerHeight;
    const headerHeight =
      typeof rawHeaderHeight === "number" && Number.isFinite(rawHeaderHeight)
        ? Math.max(0, Math.min(rawHeaderHeight, height))
        : 0;
    const detailBands = normalizeDetailBands({
      detailBands: frameVisual?.detailBands ?? null,
      frameHeight: height,
      frameWidth: width,
    });
    const detailBoxes = normalizeDetailBoxes({
      detailBoxes: frameVisual?.detailBoxes ?? null,
      frameHeight: height,
      frameWidth: width,
    });
    const detailTexts = normalizeDetailTexts({
      detailTexts: frameVisual?.detailTexts ?? null,
      frameHeight: height,
      frameWidth: width,
    });

    frames.push({
      detailBands,
      detailBoxes,
      detailTexts,
      headerDivider:
        headerHeight > 0 ? frameVisual?.headerDivider ?? null : null,
      headerFill: headerHeight > 0 ? frameVisual?.headerFill ?? null : null,
      headerHeight,
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

function paintFrameHeaderBand(
  ctx: CanvasRenderingContext2D,
  frame: SectionShellBackdropFrame,
  {
    cornerRadius,
    frameX,
    frameY,
  }: {
    cornerRadius: number;
    frameX: number;
    frameY: number;
  },
) {
  if (!frame.headerFill || frame.headerHeight <= 0) {
    return;
  }

  ctx.save();
  beginRoundedRect(
    ctx,
    frameX,
    frameY,
    frame.width,
    frame.height,
    cornerRadius,
  );
  ctx.clip();
  ctx.fillStyle = frame.headerFill;
  ctx.fillRect(frameX, frameY, frame.width, frame.headerHeight);
  ctx.restore();
}

function paintFrameHeaderDivider(
  ctx: CanvasRenderingContext2D,
  frame: SectionShellBackdropFrame,
  {
    cornerRadius,
    frameX,
    frameY,
  }: {
    cornerRadius: number;
    frameX: number;
    frameY: number;
  },
) {
  if (
    !frame.headerDivider ||
    frame.headerHeight <= 0 ||
    frame.headerHeight >= frame.height
  ) {
    return;
  }

  const dividerInset = Math.min(cornerRadius, frame.width / 4);
  const dividerY = frameY + frame.headerHeight;

  ctx.beginPath();
  ctx.moveTo(frameX + dividerInset, dividerY);
  ctx.lineTo(frameX + frame.width - dividerInset, dividerY);
  ctx.strokeStyle = frame.headerDivider;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function paintFrameDetailBandFill(
  ctx: CanvasRenderingContext2D,
  frame: SectionShellBackdropFrame,
  detailBand: SectionShellBackdropFrameDetailBand,
  {
    frameX,
    frameY,
  }: {
    frameX: number;
    frameY: number;
  },
) {
  if (!detailBand.fill || detailBand.height <= 0) {
    return;
  }

  ctx.fillStyle = detailBand.fill;
  beginRoundedRect(
    ctx,
    frameX,
    frameY + detailBand.offsetY,
    frame.width,
    detailBand.height,
    detailBand.cornerRadius,
  );
  ctx.fill();
}

function paintFrameDetailBandDivider(
  ctx: CanvasRenderingContext2D,
  frame: SectionShellBackdropFrame,
  detailBand: SectionShellBackdropFrameDetailBand,
  {
    cornerRadius,
    frameX,
    frameY,
  }: {
    cornerRadius: number;
    frameX: number;
    frameY: number;
  },
) {
  if (
    !detailBand.divider ||
    detailBand.height <= 0 ||
    detailBand.offsetY + detailBand.height >= frame.height
  ) {
    return;
  }

  const dividerInset = Math.min(
    Math.max(detailBand.cornerRadius, cornerRadius / 2),
    frame.width / 4,
  );
  const dividerY = frameY + detailBand.offsetY + detailBand.height;

  ctx.beginPath();
  ctx.moveTo(frameX + dividerInset, dividerY);
  ctx.lineTo(frameX + frame.width - dividerInset, dividerY);
  ctx.strokeStyle = detailBand.divider;
  ctx.lineWidth = 1;
  ctx.stroke();
}

function paintFrameDetailBoxFill(
  ctx: CanvasRenderingContext2D,
  detailBox: SectionShellBackdropFrameDetailBox,
  {
    frameX,
    frameY,
  }: {
    frameX: number;
    frameY: number;
  },
) {
  if (!detailBox.fill || detailBox.width <= 0 || detailBox.height <= 0) {
    return;
  }

  ctx.fillStyle = detailBox.fill;
  beginRoundedRect(
    ctx,
    frameX + detailBox.x,
    frameY + detailBox.y,
    detailBox.width,
    detailBox.height,
    detailBox.cornerRadius,
  );
  ctx.fill();
}

function paintFrameDetailText(
  ctx: CanvasRenderingContext2D,
  detailText: SectionShellBackdropFrameDetailText,
  {
    frameX,
    frameY,
  }: {
    frameX: number;
    frameY: number;
  },
) {
  if (
    !detailText.fill ||
    !detailText.font ||
    detailText.maxWidth <= 0 ||
    detailText.text.length === 0
  ) {
    return;
  }

  ctx.fillStyle = detailText.fill;
  ctx.font = detailText.font;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(
    detailText.text,
    frameX + detailText.x,
    frameY + detailText.y,
    detailText.maxWidth,
  );
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

    paintFrameHeaderBand(ctx, frame, {
      cornerRadius,
      frameX,
      frameY,
    });

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;

    paintFrameHeaderDivider(ctx, frame, {
      cornerRadius,
      frameX,
      frameY,
    });

    for (const detailBand of frame.detailBands ?? []) {
      paintFrameDetailBandFill(ctx, frame, detailBand, {
        frameX,
        frameY,
      });
      paintFrameDetailBandDivider(ctx, frame, detailBand, {
        cornerRadius,
        frameX,
        frameY,
      });
    }
    for (const detailBox of frame.detailBoxes ?? []) {
      paintFrameDetailBoxFill(ctx, detailBox, {
        frameX,
        frameY,
      });
    }
    for (const detailText of frame.detailTexts ?? []) {
      paintFrameDetailText(ctx, detailText, {
        frameX,
        frameY,
      });
    }

    ctx.strokeStyle = frame.stroke ?? palette.stroke;
    ctx.lineWidth = darkMode ? 1.5 : 1;
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
