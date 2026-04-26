export const TEXTURE_RESOLUTION_BUCKETS = [
  0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4,
] as const;

export type TextureResolutionInput = {
  readonly buckets?: readonly number[] | undefined;
  readonly cssHeight: number;
  readonly cssWidth: number;
  readonly devicePixelRatio: number;
  readonly maxTextureDimension2D: number;
  readonly zoom: number;
};

export type TextureResolution = {
  readonly clampedByMaxTexture: boolean;
  readonly cssHeight: number;
  readonly cssWidth: number;
  readonly devicePixelRatio: number;
  readonly maxTextureDimension2D: number;
  readonly pixelHeight: number;
  readonly pixelWidth: number;
  readonly requestedScale: number;
  readonly resolutionScale: number;
  readonly zoom: number;
  readonly zoomBucket: number;
};

export type TextureResolutionSnapshot = Pick<
  TextureResolution,
  "pixelHeight" | "pixelWidth" | "resolutionScale" | "zoomBucket"
>;

export function chooseTextureResolution({
  buckets = TEXTURE_RESOLUTION_BUCKETS,
  cssHeight,
  cssWidth,
  devicePixelRatio,
  maxTextureDimension2D,
  zoom,
}: TextureResolutionInput): TextureResolution {
  assertFiniteNonNegative("cssWidth", cssWidth);
  assertFiniteNonNegative("cssHeight", cssHeight);
  assertFinitePositive("devicePixelRatio", devicePixelRatio);
  assertFinitePositive("zoom", zoom);
  assertFinitePositive("maxTextureDimension2D", maxTextureDimension2D);

  const normalizedBuckets = validateResolutionBuckets(buckets);
  const zoomBucket = chooseZoomBucket(zoom, normalizedBuckets);
  const requestedScale = devicePixelRatio * zoomBucket;
  const resolutionScale = clampResolutionScale({
    cssHeight,
    cssWidth,
    maxTextureDimension2D,
    requestedScale,
  });
  const pixelWidth = sizeToTexturePixels(
    cssWidth,
    resolutionScale,
    maxTextureDimension2D,
  );
  const pixelHeight = sizeToTexturePixels(
    cssHeight,
    resolutionScale,
    maxTextureDimension2D,
  );

  return {
    clampedByMaxTexture: resolutionScale + Number.EPSILON < requestedScale,
    cssHeight,
    cssWidth,
    devicePixelRatio,
    maxTextureDimension2D,
    pixelHeight,
    pixelWidth,
    requestedScale,
    resolutionScale,
    zoom,
    zoomBucket,
  };
}

export function chooseZoomBucket(
  zoom: number,
  buckets: readonly number[] = TEXTURE_RESOLUTION_BUCKETS,
): number {
  assertFinitePositive("zoom", zoom);
  const normalizedBuckets = validateResolutionBuckets(buckets);
  const largestBucket = normalizedBuckets[normalizedBuckets.length - 1];
  if (largestBucket === undefined) {
    throw new Error("Setta GPU flow texture resolution requires buckets.");
  }
  return normalizedBuckets.find((bucket) => bucket >= zoom) ?? largestBucket;
}

export function textureResolutionMatches(
  current: TextureResolutionSnapshot,
  next: TextureResolutionSnapshot,
): boolean {
  return (
    current.pixelHeight === next.pixelHeight &&
    current.pixelWidth === next.pixelWidth &&
    current.resolutionScale === next.resolutionScale &&
    current.zoomBucket === next.zoomBucket
  );
}

function clampResolutionScale({
  cssHeight,
  cssWidth,
  maxTextureDimension2D,
  requestedScale,
}: {
  readonly cssHeight: number;
  readonly cssWidth: number;
  readonly maxTextureDimension2D: number;
  readonly requestedScale: number;
}): number {
  const maxWidthScale =
    cssWidth > 0 ? maxTextureDimension2D / cssWidth : requestedScale;
  const maxHeightScale =
    cssHeight > 0 ? maxTextureDimension2D / cssHeight : requestedScale;
  return Math.min(requestedScale, maxWidthScale, maxHeightScale);
}

function sizeToTexturePixels(
  cssSize: number,
  resolutionScale: number,
  maxTextureDimension2D: number,
): number {
  return Math.min(
    maxTextureDimension2D,
    Math.max(1, Math.ceil(cssSize * resolutionScale)),
  );
}

function validateResolutionBuckets(
  buckets: readonly number[],
): readonly number[] {
  if (buckets.length === 0) {
    throw new Error("Setta GPU flow texture resolution requires buckets.");
  }
  let previous = 0;
  for (const bucket of buckets) {
    assertFinitePositive("texture resolution bucket", bucket);
    if (bucket <= previous) {
      throw new Error(
        "Setta GPU flow texture resolution buckets must be strictly increasing.",
      );
    }
    previous = bucket;
  }
  return buckets;
}

function assertFiniteNonNegative(name: string, value: number) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a finite non-negative number.`);
  }
}

function assertFinitePositive(name: string, value: number) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a finite positive number.`);
  }
}
