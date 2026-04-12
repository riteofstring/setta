import { CodeLanguageEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  isBuiltinCodeLanguage,
  resolveCodeLanguageFromPath,
  toCodeLanguage,
} from "./codeLanguage";

describe("codeLanguage helpers", () => {
  it("treats plugin-defined language keys as non-built-in", () => {
    // Built-in enums should be recognized, but custom plugin keys should not.
    expect(isBuiltinCodeLanguage(CodeLanguageEnum.python)).toBe(true);
    expect(isBuiltinCodeLanguage("fixturedsl")).toBe(false);
  });

  it("resolves known file extensions and falls back to plaintext", () => {
    // File-based language inference should remain deterministic for built-ins.
    expect(resolveCodeLanguageFromPath("src/app.ts")).toBe(
      CodeLanguageEnum.typescript,
    );
    expect(resolveCodeLanguageFromPath("src/script.MJS")).toBe(
      CodeLanguageEnum.javascript,
    );
    expect(resolveCodeLanguageFromPath("notes/README.MarkDown")).toBe(
      CodeLanguageEnum.markdown,
    );
    expect(resolveCodeLanguageFromPath("notes.unknownext")).toBe(
      CodeLanguageEnum.plaintext,
    );
  });

  it("maps toml file extensions to toml language", () => {
    expect(resolveCodeLanguageFromPath("/tmp/app/config.toml")).toBe("toml");
  });

  it("preserves built-in keys and accepts plugin language strings", () => {
    expect(toCodeLanguage(CodeLanguageEnum.python)).toBe(
      CodeLanguageEnum.python,
    );
    expect(toCodeLanguage("fixturedsl")).toBe("fixturedsl");
  });
});
