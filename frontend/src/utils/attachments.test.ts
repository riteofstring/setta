import { describe, expect, it } from "vitest";
import {
  getAttachmentPolicy,
  isAttachmentMimeAllowed,
} from "./attachmentPolicy";
import { formatBytes, resolveAttachmentLimit } from "./attachments";
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

describe("resolveAttachmentLimit", () => {
  it("treats 0 as disabled", () => {
    expect(resolveAttachmentLimit(0)).toEqual({
      maxFiles: 0,
      disabled: true,
    });
  });

  it("treats negative values as unlimited", () => {
    expect(resolveAttachmentLimit(-1)).toEqual({
      maxFiles: null,
      disabled: false,
    });
  });

  it("uses positive values as limits", () => {
    expect(resolveAttachmentLimit(3)).toEqual({
      maxFiles: 3,
      disabled: false,
    });
  });
});

describe("getAttachmentPolicy", () => {
  it("derives chat policy fields from constants", () => {
    const policy = getAttachmentPolicy("chat");
    expect(policy.maxFiles).toBe(C.CHAT_ATTACHMENTS_MAX_FILES);
    expect(policy.maxFileBytes).toBe(C.CHAT_ATTACHMENTS_MAX_FILE_BYTES);
    expect(policy.maxFileLabel).toBe(C.CHAT_ATTACHMENTS_MAX_FILE_LABEL);
  });

  it("derives dropzone limits from constants", () => {
    const stateful = getAttachmentPolicy("dropzone_stateful");
    const stateless = getAttachmentPolicy("dropzone_stateless");
    expect(stateful.maxFileBytes).toBe(C.DROPZONE_STATEFUL_MAX_FILE_BYTES);
    expect(stateless.maxFileBytes).toBe(C.DROPZONE_STATELESS_MAX_FILE_BYTES);
    expect(stateless.maxTotalBytes).toBe(C.DROPZONE_STATELESS_MAX_TOTAL_BYTES);
  });
});

describe("isAttachmentMimeAllowed", () => {
  it("permits all types when no prefixes are configured", () => {
    const policy = getAttachmentPolicy("chat");
    const normalized = { ...policy, allowedMimePrefixes: [] };
    expect(isAttachmentMimeAllowed("text/plain", normalized)).toBe(true);
  });

  it("blocks disallowed mime types when prefixes are set", () => {
    const policy = getAttachmentPolicy("chat");
    const normalized = { ...policy, allowedMimePrefixes: ["image/"] };
    expect(isAttachmentMimeAllowed("text/plain", normalized)).toBe(false);
  });
});
