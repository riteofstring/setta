import { describe, expect, it } from "vitest";
import {
  isFileBrowserPreviewRequestStale,
  resolveFileBrowserPreviewKind,
} from "./FileBrowserUniversalPreview";

describe("FileBrowserUniversalPreview kind resolution", () => {
  it("classifies spreadsheet paths as spreadsheet previews", () => {
    expect(
      resolveFileBrowserPreviewKind({
        filePath: "/workspace/report.csv",
        fileName: "report.csv",
      }),
    ).toBe("spreadsheet");
    expect(
      resolveFileBrowserPreviewKind({
        filePath: "/workspace/report.xlsx",
        fileName: "report.xlsx",
      }),
    ).toBe("spreadsheet");
  });

  it("classifies common media/text kinds", () => {
    expect(
      resolveFileBrowserPreviewKind({
        filePath: "/workspace/photo.png",
        fileName: "photo.png",
      }),
    ).toBe("image");
    expect(
      resolveFileBrowserPreviewKind({
        filePath: "/workspace/readme.md",
        fileName: "readme.md",
      }),
    ).toBe("text");
    expect(
      resolveFileBrowserPreviewKind({
        filePath: "/workspace/archive.tar.gz",
        fileName: "archive.tar.gz",
      }),
    ).toBe("archive");
    expect(
      resolveFileBrowserPreviewKind({
        filePath: "/workspace/blob.bin",
        fileName: "blob.bin",
      }),
    ).toBe("other");
  });

  it("detects stale async preview requests", () => {
    expect(
      isFileBrowserPreviewRequestStale({
        activeRequestId: 2,
        requestId: 1,
        currentSelectedPath: "/workspace/a.txt",
        requestedPath: "/workspace/a.txt",
      }),
    ).toBe(true);
    expect(
      isFileBrowserPreviewRequestStale({
        activeRequestId: 1,
        requestId: 1,
        currentSelectedPath: "/workspace/b.txt",
        requestedPath: "/workspace/a.txt",
      }),
    ).toBe(true);
    expect(
      isFileBrowserPreviewRequestStale({
        activeRequestId: 1,
        requestId: 1,
        currentSelectedPath: "/workspace/a.txt",
        requestedPath: "/workspace/a.txt",
      }),
    ).toBe(false);
  });
});
