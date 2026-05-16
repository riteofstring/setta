import type { HtmlSurfaceTextureResources } from "./htmlSurfaces/textureTiles";
import type { RetainedTexturePageDescriptor } from "./retainedTexturePages";

export function createRetainedContentTextureResources({
  descriptor,
  device,
  format,
  textureUsage,
}: {
  readonly descriptor: RetainedTexturePageDescriptor;
  readonly device: GPUDevice;
  readonly format: GPUTextureFormat;
  readonly textureUsage: GPUTextureUsageFlags;
}): HtmlSurfaceTextureResources {
  const texture = device.createTexture({
    format,
    label: `setta-retained-content-page-${descriptor.surfaceId}-${descriptor.tileColumn}-${descriptor.tileRow}-${descriptor.lodScale}`,
    size: {
      height: descriptor.pixelHeight,
      width: descriptor.pixelWidth,
    },
    usage: textureUsage,
  });
  const textureView = texture.createView({
    label: `setta-retained-content-page-${descriptor.surfaceId}-${descriptor.tileColumn}-${descriptor.tileRow}-${descriptor.lodScale}-view`,
  });
  const sampler = device.createSampler({
    addressModeU: "clamp-to-edge",
    addressModeV: "clamp-to-edge",
    magFilter: "linear",
    minFilter: "linear",
  });
  return { sampler, texture, textureView };
}
