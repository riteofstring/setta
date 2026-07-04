import type {
  ImageAttachment,
  ImageAttachmentVariant,
  ImageAttachmentVariantKind,
  ImagePart,
} from "@generated/backend";

type ImageVariantSource = Pick<ImageAttachment | ImagePart, "fileName" | "variants">;

export type ImageVariantSelection =
  | { status: "ready"; variant: ImageAttachmentVariant }
  | { status: "invalid"; message: string };

export function selectImageVariant(
  source: ImageVariantSource,
  kind: ImageAttachmentVariantKind,
): ImageVariantSelection {
  const matches = source.variants.filter((variant) => variant.kind === kind);
  if (matches.length === 0) {
    return { status: "invalid", message: `${source.fileName} is missing ${kind} image variant.` };
  }
  if (matches.length > 1) {
    return {
      status: "invalid",
      message: `${source.fileName} has duplicate ${kind} image variants.`,
    };
  }
  const variant = matches[0];
  if (!variant) {
    return { status: "invalid", message: `${source.fileName} is missing ${kind} image variant.` };
  }
  if (!variant.url || variant.byteSize <= 0 || variant.width <= 0 || variant.height <= 0) {
    return { status: "invalid", message: `${source.fileName} has invalid ${kind} image metadata.` };
  }
  return { status: "ready", variant };
}
