import { describe, expect, it } from "vitest";

import { getValidSectionNameForOpenedFile } from "./createSectionFileOpenShared";

describe("getValidSectionNameForOpenedFile", () => {
  it("keeps extensions as safe suffixes so names stay unique", () => {
    // Different extensions should produce different valid section names.
    expect(getValidSectionNameForOpenedFile("browser_test.md")).toBe(
      "browser_test_md",
    );
  });

  it("replaces unsupported characters with safe separators", () => {
    // Paths and punctuation are not valid section-name characters.
    expect(getValidSectionNameForOpenedFile("weird/..\\name!.txt")).toBe(
      "weird name_txt",
    );
  });

  it("keeps hidden-file stems valid", () => {
    // Dotfiles still need a non-empty section name.
    expect(getValidSectionNameForOpenedFile(".env")).toBe("_env");
  });

  it("falls back to a stable default when the input is empty", () => {
    // Some paths can resolve to blank labels after trimming/sanitization.
    expect(getValidSectionNameForOpenedFile("   ")).toBe("Opened File");
  });
});
