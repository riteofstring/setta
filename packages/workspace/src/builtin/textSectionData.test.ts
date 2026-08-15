import { describe, expect, it } from "vitest";
import {
  createWorkspaceTextSectionData,
  getWorkspaceTextSectionEditorLanguage,
  parseWorkspaceTextSectionData,
  WORKSPACE_TEXT_SECTION_DEFAULT_FONT_SIZE,
  WORKSPACE_TEXT_SECTION_MAXIMUM_FONT_SIZE,
  WORKSPACE_TEXT_SECTION_MINIMUM_FONT_SIZE,
} from "./textSectionData";
import { buildWorkspaceTextTypographyScale } from "./textSectionTypography";

// The built-in Text section's document contract is package-owned, so it is parsed rather than
// trusted: a document that names an unknown field, an unsupported format, or an unusable font
// size fails where it enters the package instead of on first paint.

describe("built-in text section data", () => {
  it("opens on the reference's empty plain-text editor at its 14 px base", () => {
    expect(createWorkspaceTextSectionData()).toEqual({
      text: "",
      format: "plaintext",
      displayMode: "edit",
      fontSizePx: WORKSPACE_TEXT_SECTION_DEFAULT_FONT_SIZE,
      readOnly: false,
    });
  });

  it("parses a complete authored section", () => {
    const data = createWorkspaceTextSectionData({
      text: "# Notes",
      format: "markdown",
      displayMode: "render",
      fontSizePx: 18,
      readOnly: true,
    });
    expect(parseWorkspaceTextSectionData("text", data)).toEqual(data);
  });

  it.each([
    ["missing data", undefined, "is missing its text section data"],
    ["a non-object", "notes", "is missing its text section data"],
    [
      "an unknown field",
      { ...createWorkspaceTextSectionData(), heading: "Notes" },
      "carries the unknown field heading",
    ],
    [
      "a non-string text",
      { ...createWorkspaceTextSectionData(), text: 4 },
      "is missing its string text field",
    ],
    [
      "a non-boolean readOnly",
      { ...createWorkspaceTextSectionData(), readOnly: "yes" },
      "is missing its boolean readOnly field",
    ],
    [
      "an unknown format",
      { ...createWorkspaceTextSectionData(), format: "rst" },
      "names the format rst",
    ],
    [
      "an unknown display mode",
      { ...createWorkspaceTextSectionData(), displayMode: "preview" },
      "names the display mode preview",
    ],
  ])("rejects %s", (_case, data, message) => {
    expect(() => parseWorkspaceTextSectionData("text", data)).toThrow(message);
  });

  it.each([
    WORKSPACE_TEXT_SECTION_MINIMUM_FONT_SIZE - 1,
    WORKSPACE_TEXT_SECTION_MAXIMUM_FONT_SIZE + 1,
    Number.NaN,
  ])("rejects the unusable font size %s", (fontSizePx) => {
    const data = { ...createWorkspaceTextSectionData(), fontSizePx };
    expect(() => parseWorkspaceTextSectionData("text", data)).toThrow("needs a fontSizePx between");
  });

  it("accepts both ends of the reference's font-size range", () => {
    for (const fontSizePx of [
      WORKSPACE_TEXT_SECTION_MINIMUM_FONT_SIZE,
      WORKSPACE_TEXT_SECTION_MAXIMUM_FONT_SIZE,
    ]) {
      const data = createWorkspaceTextSectionData({ fontSizePx });
      expect(parseWorkspaceTextSectionData("text", data).fontSizePx).toBe(fontSizePx);
    }
  });

  it("refuses a format or display mode this registration narrowed away", () => {
    const markdownOnly = { formats: ["markdown"], displayModes: ["render", "edit"] } as const;
    expect(() =>
      parseWorkspaceTextSectionData("text", createWorkspaceTextSectionData(), markdownOnly),
    ).toThrow("Allowed formats: markdown");

    const renderOnly = { formats: ["plaintext", "markdown"], displayModes: ["render"] } as const;
    expect(() =>
      parseWorkspaceTextSectionData("text", createWorkspaceTextSectionData(), renderOnly),
    ).toThrow("Allowed display modes: render");
  });

  it("edits Markdown through the Markdown pack and plain text through none", () => {
    expect(getWorkspaceTextSectionEditorLanguage("markdown")).toBe("markdown");
    expect(getWorkspaceTextSectionEditorLanguage("plaintext")).toBeNull();
  });

  it("scales the rendered typography from the reference's ratios", () => {
    // The reference's own recorded scale at its 14 px base.
    expect(buildWorkspaceTextTypographyScale(14)).toEqual({
      bodyPx: 14,
      codePx: 12.9,
      h1Px: 28,
      h2Px: 22.4,
      h3Px: 18.9,
      h4Px: 16.5,
      h5Px: 14.6,
      h6Px: 13.3,
    });
  });
});
