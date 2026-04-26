import { describe, expect, it } from "vitest";
import {
  getCodeMirrorLanguageExtensions,
  getCodeMirrorLanguageParser,
  getCodeMirrorLanguageParserForPath,
} from "./codeMirrorLanguages";

describe("codeMirrorLanguages", () => {
  it("returns language extension packs for json, yaml, and toml", () => {
    const jsonExtensions = getCodeMirrorLanguageExtensions("json", false);
    const yamlExtensions = getCodeMirrorLanguageExtensions("yaml", false);
    const tomlExtensions = getCodeMirrorLanguageExtensions("toml", false);

    expect(jsonExtensions).toHaveLength(1);
    expect(yamlExtensions).toHaveLength(1);
    expect(tomlExtensions).toHaveLength(1);
  });

  it("returns parser instances for supported languages", () => {
    expect(getCodeMirrorLanguageParser("json", false)).not.toBeNull();
    expect(getCodeMirrorLanguageParser("yaml", false)).not.toBeNull();
    expect(getCodeMirrorLanguageParser("toml", false)).not.toBeNull();
    expect(getCodeMirrorLanguageParser("python", false)).not.toBeNull();
    expect(getCodeMirrorLanguageParser("plaintext", false)).toBeNull();
  });

  it("maps code parsers from file paths with jsx/tsx specific handling", () => {
    expect(getCodeMirrorLanguageParserForPath("src/app.tsx")).not.toBeNull();
    expect(getCodeMirrorLanguageParserForPath("src/app.jsx")).not.toBeNull();
    expect(
      getCodeMirrorLanguageParserForPath("src/config.yaml"),
    ).not.toBeNull();
    expect(
      getCodeMirrorLanguageParserForPath("src/config.toml"),
    ).not.toBeNull();
    expect(getCodeMirrorLanguageParserForPath("src/readme.md")).not.toBeNull();
    expect(getCodeMirrorLanguageParserForPath("src/notes.txt")).toBeNull();
  });
});
