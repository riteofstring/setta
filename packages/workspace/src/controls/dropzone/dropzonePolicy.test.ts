/* @vitest-environment jsdom */

import { describe, expect, it } from "vitest";
import {
  assertDropzoneAttachments,
  assertDropzonePolicy,
  formatDropzoneBytes,
  getDroppedTextRejection,
  getDropzoneRemainingSlots,
  partitionDropzoneFiles,
} from "./dropzonePolicy";
import type { DropzoneAttachment, DropzonePolicy } from "./dropzoneTypes";

const POLICY: DropzonePolicy = {
  maxAttachments: 3,
  maxFileBytes: 5,
  maxTotalBytes: 6,
  allowedMimePrefixes: ["image/"],
};

function makeFile(name: string, size: number, type: string): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("dropzone policy", () => {
  it("fails specifically on invalid host configuration", () => {
    expect(() => assertDropzonePolicy({ ...POLICY, maxAttachments: 0 })).toThrow(
      "invalid maxAttachments: 0",
    );
    expect(() => assertDropzonePolicy({ ...POLICY, maxFileBytes: Number.NaN })).toThrow(
      "invalid maxFileBytes: NaN",
    );
    expect(() => assertDropzonePolicy({ ...POLICY, maxTotalBytes: -1 })).toThrow(
      "invalid maxTotalBytes: -1",
    );
    expect(() => assertDropzonePolicy({ ...POLICY, allowedMimePrefixes: [" image/"] })).toThrow(
      'invalid allowedMimePrefix: " image/"',
    );
  });

  it("validates host-owned attachment identity, metadata, and count", () => {
    const attachment: DropzoneAttachment = {
      id: "attachment-1",
      kind: "file",
      name: "photo.png",
      size: 1024,
    };
    expect(() => assertDropzoneAttachments([attachment], POLICY)).not.toThrow();
    expect(getDropzoneRemainingSlots([attachment], POLICY)).toBe(2);
    expect(getDropzoneRemainingSlots([attachment], { ...POLICY, maxAttachments: null })).toBeNull();
    expect(() => assertDropzoneAttachments([attachment, attachment], POLICY)).toThrow(
      "duplicate attachment id: attachment-1",
    );
    expect(() =>
      assertDropzoneAttachments(
        [attachment, { ...attachment, id: "2" }, { ...attachment, id: "3" }],
        { ...POLICY, maxAttachments: 2 },
      ),
    ).toThrow("3 attachments above its 2 attachment limit");
  });

  it("ports the reference file-size, MIME, and sequential total-size filters", () => {
    const oversized = makeFile("oversized.png", 6, "image/png");
    const wrongType = makeFile("notes.txt", 1, "text/plain");
    const firstImage = makeFile("first.png", 4, "image/png");
    const secondImage = makeFile("second.png", 4, "image/png");
    const result = partitionDropzoneFiles(
      [oversized, wrongType, firstImage, secondImage],
      POLICY,
      3,
    );
    expect(result.accepted).toEqual([firstImage]);
    expect(result.rejected.map(({ file, reason }) => [file.name, reason])).toEqual([
      ["oversized.png", "file-size"],
      ["notes.txt", "mime-type"],
      ["second.png", "total-size"],
    ]);

    const totalLimited = partitionDropzoneFiles(
      [firstImage, secondImage],
      { ...POLICY, maxAttachments: null },
      null,
    );
    expect(totalLimited.accepted).toEqual([firstImage]);
    expect(totalLimited.rejected).toEqual([
      { kind: "file", file: secondImage, reason: "total-size" },
    ]);
  });

  it("keeps the frozen phase order in which a slotted MIME rejection precedes count overflow", () => {
    const wrongType = makeFile("notes.txt", 1, "text/plain");
    const image = makeFile("photo.png", 1, "image/png");
    const result = partitionDropzoneFiles([wrongType, image], POLICY, 1);
    expect(result.accepted).toEqual([]);
    expect(result.rejected).toEqual([
      { kind: "file", file: image, reason: "attachment-count" },
      { kind: "file", file: wrongType, reason: "mime-type" },
    ]);
  });

  it("applies attachment count and UTF-8 total limits to dropped text", () => {
    expect(getDroppedTextRejection("hello", POLICY, 0)).toEqual({
      kind: "text",
      text: "hello",
      reason: "attachment-count",
    });
    expect(getDroppedTextRejection("éééé", POLICY, 1)).toEqual({
      kind: "text",
      text: "éééé",
      reason: "total-size",
    });
    expect(getDroppedTextRejection("hello", POLICY, 1)).toBeNull();
  });

  it("ports the reference byte-formatting labels", () => {
    expect(formatDropzoneBytes(0)).toBe("0 B");
    expect(formatDropzoneBytes(1024)).toBe("1 KB");
    expect(formatDropzoneBytes(1536)).toBe("1.5 KB");
    expect(formatDropzoneBytes(10_650)).toBe("10 KB");
  });
});
