import { describe, expect, it } from "vitest";
import { hasMarkdownHeadingText } from "./SectionHeader";

describe("hasMarkdownHeadingText", () => {
  it("returns true for h1-h6 headings", () => {
    expect(hasMarkdownHeadingText("# Title")).toBe(true);
    expect(hasMarkdownHeadingText("## Tasks")).toBe(true);
    expect(hasMarkdownHeadingText("### Notes")).toBe(true);
    expect(hasMarkdownHeadingText("###### Deep")).toBe(true);
  });

  it("accepts up to three leading spaces", () => {
    expect(hasMarkdownHeadingText("  ## Indented")).toBe(true);
  });

  it("returns false when there is no heading text", () => {
    expect(hasMarkdownHeadingText("#   ")).toBe(false);
  });

  it("returns false for seven hashes", () => {
    expect(hasMarkdownHeadingText("####### Too deep")).toBe(false);
  });
});
