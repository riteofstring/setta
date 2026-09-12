import { describe, expect, it } from "vitest";
import {
  getTextValueLanguageExtensions,
  getTextValueLanguageParser,
  type TextValueLanguage,
} from "./textValueLanguages";

const SLICE_LANGUAGES: Array<TextValueLanguage> = [
  "python",
  "typescript",
  "javascript",
  "json",
  "yaml",
  "toml",
  "markdown",
];

describe("textValueLanguages", () => {
  it("returns one extension pack per declared language", () => {
    for (const language of SLICE_LANGUAGES) {
      expect(getTextValueLanguageExtensions(language)).toHaveLength(1);
    }
  });

  it("returns parser instances for every declared language", () => {
    for (const language of SLICE_LANGUAGES) {
      expect(getTextValueLanguageParser(language)).not.toBeNull();
    }
  });

  it("resolves no support without a declared language", () => {
    expect(getTextValueLanguageExtensions(null)).toHaveLength(0);
    expect(getTextValueLanguageExtensions(undefined)).toHaveLength(0);
    expect(getTextValueLanguageParser(null)).toBeNull();
    expect(getTextValueLanguageParser(undefined)).toBeNull();
  });
});
