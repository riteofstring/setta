export type HtmlSurfaceTextureSourceRect = {
  readonly height: number;
  readonly width: number;
  readonly x: number;
  readonly y: number;
};

export type TextureSourceRectUploadRecord = {
  readonly cssHeight: number;
  readonly cssWidth: number;
  readonly pixelHeight: number;
  readonly pixelWidth: number;
  readonly textureBytes: number;
};

export type TextureSourceRectUploadRegion = {
  readonly byteLength: number;
  readonly destinationX: number;
  readonly destinationY: number;
  readonly pixelHeight: number;
  readonly pixelWidth: number;
  readonly sourceHeight: number;
  readonly sourceWidth: number;
  readonly sourceX: number;
  readonly sourceY: number;
};

export function resolveTextureSourceRectUploadRegion(
  record: TextureSourceRectUploadRecord,
  sourceRect: HtmlSurfaceTextureSourceRect,
): TextureSourceRectUploadRegion {
  validateTextureSourceRectRecord(record);
  validateTextureSourceRect(sourceRect);

  const sourceLeft = clamp(sourceRect.x, 0, record.cssWidth);
  const sourceTop = clamp(sourceRect.y, 0, record.cssHeight);
  const sourceRight = clamp(
    sourceRect.x + sourceRect.width,
    0,
    record.cssWidth,
  );
  const sourceBottom = clamp(
    sourceRect.y + sourceRect.height,
    0,
    record.cssHeight,
  );
  if (sourceRight <= sourceLeft || sourceBottom <= sourceTop) {
    throw new Error(
      "Setta GPU flow HTML surface dirty source rect must intersect the source texture.",
    );
  }

  const scaleX = record.pixelWidth / record.cssWidth;
  const scaleY = record.pixelHeight / record.cssHeight;
  const destinationX = clampInteger(
    Math.floor(sourceLeft * scaleX),
    0,
    record.pixelWidth - 1,
  );
  const destinationY = clampInteger(
    Math.floor(sourceTop * scaleY),
    0,
    record.pixelHeight - 1,
  );
  const destinationRight = clampInteger(
    Math.ceil(sourceRight * scaleX),
    destinationX + 1,
    record.pixelWidth,
  );
  const destinationBottom = clampInteger(
    Math.ceil(sourceBottom * scaleY),
    destinationY + 1,
    record.pixelHeight,
  );
  const pixelWidth = destinationRight - destinationX;
  const pixelHeight = destinationBottom - destinationY;
  const bytesPerPixel =
    record.textureBytes / (record.pixelWidth * record.pixelHeight);

  return {
    byteLength: Math.ceil(pixelWidth * pixelHeight * bytesPerPixel),
    destinationX,
    destinationY,
    pixelHeight,
    pixelWidth,
    sourceHeight: pixelHeight / scaleY,
    sourceWidth: pixelWidth / scaleX,
    sourceX: destinationX / scaleX,
    sourceY: destinationY / scaleY,
  };
}

function validateTextureSourceRectRecord({
  cssHeight,
  cssWidth,
  pixelHeight,
  pixelWidth,
  textureBytes,
}: TextureSourceRectUploadRecord) {
  if (
    ![cssHeight, cssWidth, pixelHeight, pixelWidth, textureBytes].every(
      Number.isFinite,
    ) ||
    cssHeight <= 0 ||
    cssWidth <= 0 ||
    pixelHeight <= 0 ||
    pixelWidth <= 0 ||
    textureBytes <= 0
  ) {
    throw new Error(
      "Setta GPU flow HTML surface dirty source rect upload requires finite positive texture dimensions.",
    );
  }
}

function validateTextureSourceRect({
  height,
  width,
  x,
  y,
}: HtmlSurfaceTextureSourceRect) {
  if (
    ![height, width, x, y].every(Number.isFinite) ||
    height <= 0 ||
    width <= 0
  ) {
    throw new Error(
      "Setta GPU flow HTML surface dirty source rect upload requires a finite positive source rect.",
    );
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function clampInteger(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, Math.trunc(value)));
}
