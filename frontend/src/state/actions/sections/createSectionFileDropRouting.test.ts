import { CodeLanguageEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import { resolveFileDropSectionOpenTarget } from "./createSectionFileDropRouting";

describe("resolveFileDropSectionOpenTarget", () => {
  it("routes spreadsheet paths to spreadsheet section opens", () => {
    // Spreadsheet-like files should skip code-language detection and open in the spreadsheet surface.
    expect(
      resolveFileDropSectionOpenTarget({
        fileName: "report.csv",
        filePath: "/workspace/report.csv",
      }),
    ).toEqual({ kind: "spreadsheet" });
  });

  it("routes images to image section opens", () => {
    // Image previews should become image sections instead of generic code sections.
    expect(
      resolveFileDropSectionOpenTarget({
        fileName: "photo.png",
        filePath: "/workspace/photo.png",
      }),
    ).toEqual({ kind: "image" });
  });

  it("routes text files to code sections with the resolved language", () => {
    // Text-like drops should keep their inferred language so the resulting code section is configured correctly.
    expect(
      resolveFileDropSectionOpenTarget({
        fileName: "main.py",
        filePath: "/workspace/main.py",
      }),
    ).toEqual({
      kind: "code",
      codeLanguage: CodeLanguageEnum.python,
    });
  });

  it("marks non-text binary files as unsupported", () => {
    // Binary drops should fail fast before any section-creation work starts.
    expect(
      resolveFileDropSectionOpenTarget({
        fileName: "archive.zip",
        filePath: "/workspace/archive.zip",
      }),
    ).toEqual({ kind: "unsupported_binary" });
  });
});
