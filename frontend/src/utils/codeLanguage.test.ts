import { CodeLanguageEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import {
  isBuiltinCodeLanguage,
  isRunnableCodeLanguage,
  resolveCodeLanguageFromPath,
} from "./codeLanguage";

describe("codeLanguage helpers", () => {
  it("treats plugin-defined language keys as non-built-in", () => {
    // Built-in enums should be recognized, but custom plugin keys should not.
    expect(isBuiltinCodeLanguage(CodeLanguageEnum.python)).toBe(true);
    expect(isBuiltinCodeLanguage("fixturedsl")).toBe(false);
  });

  it("keeps runnable checks scoped to python and bash", () => {
    // Custom languages can use LSP/editor features, but run remains python/bash-only.
    expect(isRunnableCodeLanguage(CodeLanguageEnum.python)).toBe(true);
    expect(isRunnableCodeLanguage(CodeLanguageEnum.bash)).toBe(true);
    expect(isRunnableCodeLanguage("fixturedsl")).toBe(false);
  });

  it("resolves known file extensions and falls back to plaintext", () => {
    // File-based language inference should remain deterministic for built-ins.
    expect(resolveCodeLanguageFromPath("src/app.ts")).toBe(
      CodeLanguageEnum.typescript,
    );
    expect(resolveCodeLanguageFromPath("notes.unknownext")).toBe(
      CodeLanguageEnum.plaintext,
    );
  });
});
