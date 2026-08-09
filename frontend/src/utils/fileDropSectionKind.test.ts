import { describe, expect, it } from "vitest";
import { resolveFileDropSectionKind } from "./fileDropSectionKind";

describe("resolveFileDropSectionKind", () => {
  it("maps spreadsheet files to spreadsheet sections", () => {
    expect(
      resolveFileDropSectionKind({
        fileName: "report.csv",
        filePath: "/tmp/report.csv",
      }),
    ).toBe("spreadsheet");
    expect(
      resolveFileDropSectionKind({
        fileName: "report.xlsx",
        filePath: "/tmp/report.xlsx",
      }),
    ).toBe("spreadsheet");
  });

  it("maps image files to image sections", () => {
    expect(
      resolveFileDropSectionKind({
        fileName: "image.png",
        filePath: "/tmp/image.png",
      }),
    ).toBe("image");
  });

  it("maps text/code files to code sections", () => {
    expect(
      resolveFileDropSectionKind({
        fileName: "script.py",
        filePath: "/tmp/script.py",
      }),
    ).toBe("code");
  });

  it("marks binary/unsupported files as unsupported", () => {
    expect(
      resolveFileDropSectionKind({
        fileName: "clip.mp4",
        filePath: "/tmp/clip.mp4",
      }),
    ).toBe("unsupported_binary");
    expect(
      resolveFileDropSectionKind({
        fileName: "doc.pdf",
        filePath: "/tmp/doc.pdf",
      }),
    ).toBe("unsupported_binary");
  });
});
