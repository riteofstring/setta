import { getAttachmentPolicy } from "utils/attachmentPolicy";
import { describe, expect, it } from "vitest";
import { validateChatUploadFiles } from "./useChatAttachmentManager";

function createFileLike(overrides: Partial<File> & { name: string }): File {
  return {
    name: overrides.name,
    size: overrides.size ?? 0,
    type: overrides.type ?? "",
  } as File;
}

describe("validateChatUploadFiles", () => {
  it("keeps supported uploads and reports each skipped category once", () => {
    const chatPolicy = {
      ...getAttachmentPolicy("chat"),
      allowedMimePrefixes: ["image/"],
      allowedMimeLabel: "Allowed types: image/.",
      maxFileBytes: 10,
      maxFileLabel: "10 B",
    };
    const validFile = createFileLike({
      name: "design.png",
      size: 5,
      type: "image/png",
    });
    const rejectedByType = createFileLike({
      name: "notes.txt",
      size: 3,
      type: "text/plain",
    });
    const rejectedByImageSupport = createFileLike({
      name: "photo.avif",
      size: 3,
      type: "image/avif",
    });
    const rejectedBySize = createFileLike({
      name: "large.png",
      size: 11,
      type: "image/png",
    });
    const ignoredPastLimit = createFileLike({
      name: "ignored.png",
      size: 3,
      type: "image/png",
    });

    const result = validateChatUploadFiles({
      allowedMimeLabel: chatPolicy.allowedMimeLabel,
      chatPolicy,
      files: [
        validFile,
        rejectedByType,
        rejectedByImageSupport,
        rejectedBySize,
        ignoredPastLimit,
      ],
      remainingSlots: 4,
    });

    expect(result.validFiles).toEqual([validFile]);
    expect(result.warnings).toEqual([
      "Some files were skipped due to type restrictions. Allowed types: image/.",
      "Some images were skipped. Supported image types: JPEG, PNG, GIF, WebP.",
      "File exceeds 10 B limit.",
    ]);
  });

  it("returns valid files without warnings when every file passes", () => {
    const chatPolicy = {
      ...getAttachmentPolicy("chat"),
      allowedMimePrefixes: ["image/"],
      allowedMimeLabel: "Allowed types: image/.",
      maxFileBytes: 20,
      maxFileLabel: "20 B",
    };
    const files = [
      createFileLike({
        name: "diagram.png",
        size: 5,
        type: "image/png",
      }),
      createFileLike({
        name: "reference.webp",
        size: 8,
        type: "image/webp",
      }),
    ];

    const result = validateChatUploadFiles({
      allowedMimeLabel: chatPolicy.allowedMimeLabel,
      chatPolicy,
      files,
      remainingSlots: null,
    });

    expect(result.validFiles).toEqual(files);
    expect(result.warnings).toEqual([]);
  });
});
