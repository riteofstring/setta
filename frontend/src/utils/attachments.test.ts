import { describe, expect, it } from "vitest";
import {
  CHAT_ATTACHMENT_MAX_FILE_BYTES,
  CHAT_ATTACHMENT_MAX_FILE_LABEL,
  CHAT_ATTACHMENT_MAX_FILES,
  formatBytes,
  resolveChatAttachmentLimit,
} from "./attachments";
import { C } from "./c";

describe("formatBytes", () => {
  it("returns 0 B for non-positive values", () => {
    expect(formatBytes(0)).toBe("0 B");
    expect(formatBytes(-5)).toBe("0 B");
  });

  it("formats kilobytes with rounding rules", () => {
    expect(formatBytes(1024)).toBe("1 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(10650)).toBe("10 KB");
  });
});

describe("chat attachment constants", () => {
  it("derives attachment limits from constants", () => {
    expect(CHAT_ATTACHMENT_MAX_FILES).toBe(C.CHAT_ATTACHMENTS_MAX_FILES);
    expect(CHAT_ATTACHMENT_MAX_FILE_BYTES).toBe(
      C.CHAT_ATTACHMENTS_MAX_FILE_BYTES,
    );
    expect(CHAT_ATTACHMENT_MAX_FILE_LABEL).toBe(
      formatBytes(C.CHAT_ATTACHMENTS_MAX_FILE_BYTES),
    );
  });
});

describe("resolveChatAttachmentLimit", () => {
  it("treats 0 as disabled", () => {
    expect(resolveChatAttachmentLimit(0)).toEqual({
      maxFiles: 0,
      disabled: true,
    });
  });

  it("treats negative values as unlimited", () => {
    expect(resolveChatAttachmentLimit(-1)).toEqual({
      maxFiles: null,
      disabled: false,
    });
  });

  it("uses positive values as limits", () => {
    expect(resolveChatAttachmentLimit(3)).toEqual({
      maxFiles: 3,
      disabled: false,
    });
  });
});
