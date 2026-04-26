import { describe, expect, it } from "vitest";
import {
  isChatImageAttachmentSupported,
  isChatImageFileSupported,
} from "./chatAttachmentSupport";
import { ChatFileAttachment } from "./generatedTypes";

function buildAttachment(
  overrides: Partial<ChatFileAttachment>,
): ChatFileAttachment {
  return {
    id: "artifacts/attachment.bin",
    name: "attachment.bin",
    mimeType: "application/octet-stream",
    size: 10,
    ...overrides,
  };
}

describe("chatAttachmentSupport", () => {
  it("rejects unsupported image mime types", () => {
    const file = new File(["payload"], "photo.avif", { type: "image/avif" });
    expect(isChatImageFileSupported(file)).toBe(false);
  });

  it("accepts supported image mime aliases", () => {
    const file = new File(["payload"], "photo.jpg", { type: "image/jpg" });
    expect(isChatImageFileSupported(file)).toBe(true);
  });

  it("accepts legacy png mime aliases", () => {
    const file = new File(["payload"], "image.png", { type: "image/x-png" });
    expect(isChatImageFileSupported(file)).toBe(true);
  });

  it("uses extensions when mime types are missing", () => {
    const supported = new File(["payload"], "photo.webp", { type: "" });
    const unsupported = new File(["payload"], "photo.heic", { type: "" });
    expect(isChatImageFileSupported(supported)).toBe(true);
    expect(isChatImageFileSupported(unsupported)).toBe(false);
  });

  it("allows non-image files", () => {
    const file = new File(["payload"], "doc.pdf", { type: "application/pdf" });
    expect(isChatImageFileSupported(file)).toBe(true);
  });

  it("checks attachments by mime or extension", () => {
    const unsupported = buildAttachment({
      name: "photo.avif",
      mimeType: "image/avif",
    });
    const unsupportedByExtension = buildAttachment({
      name: "photo.heic",
      mimeType: "application/octet-stream",
    });
    const supportedByMime = buildAttachment({
      name: "photo.jpg",
      mimeType: "image/jpeg",
    });
    const supportedByExtension = buildAttachment({
      name: "photo.webp",
      mimeType: "application/octet-stream",
    });
    expect(isChatImageAttachmentSupported(unsupported)).toBe(false);
    expect(isChatImageAttachmentSupported(unsupportedByExtension)).toBe(false);
    expect(isChatImageAttachmentSupported(supportedByMime)).toBe(true);
    expect(isChatImageAttachmentSupported(supportedByExtension)).toBe(true);
  });
});
