import { describe, expect, it } from "vitest";
import {
  getAttachmentPreviewKind,
  isTextAttachment,
} from "./attachmentPreview";
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

describe("attachmentPreview", () => {
  it("treats octet-stream toml as text", () => {
    const attachment = buildAttachment({
      name: "config.toml",
      id: "artifacts/config.toml",
    });
    expect(isTextAttachment(attachment)).toBe(true);
    expect(getAttachmentPreviewKind(attachment)).toBe("text");
  });

  it("treats vtt as text", () => {
    const attachment = buildAttachment({
      name: "subtitles.vtt",
      id: "artifacts/subtitles.vtt",
    });
    expect(isTextAttachment(attachment)).toBe(true);
    expect(getAttachmentPreviewKind(attachment)).toBe("text");
  });

  it("detects pdf by mime", () => {
    const attachment = buildAttachment({ mimeType: "application/pdf" });
    expect(getAttachmentPreviewKind(attachment)).toBe("pdf");
  });

  it("detects audio by extension", () => {
    const attachment = buildAttachment({ name: "audio.mp3" });
    expect(getAttachmentPreviewKind(attachment)).toBe("audio");
  });

  it("detects video by mime", () => {
    const attachment = buildAttachment({ mimeType: "video/mp4" });
    expect(getAttachmentPreviewKind(attachment)).toBe("video");
  });

  it("detects archives by compound extension", () => {
    const attachment = buildAttachment({ name: "bundle.tar.gz" });
    expect(getAttachmentPreviewKind(attachment)).toBe("archive");
  });
});
