import { CodeLanguageEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { resolveCodeLanguageFromPath } from "./codeLanguage";

describe("codeLanguage helpers", () => {
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
});
