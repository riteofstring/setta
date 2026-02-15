import { describe, expect, it } from "vitest";
import {
  isRunnableCodeLanguage,
  resolveCodeLanguageFromPath,
} from "./codeLanguage";

describe("codeLanguage helpers", () => {
  it("maps toml file extensions to toml language", () => {
    expect(resolveCodeLanguageFromPath("/tmp/app/config.toml")).toBe("toml");
  });

  it("keeps toml non-runnable while python/bash remain runnable", () => {
    expect(isRunnableCodeLanguage("python")).toBe(true);
    expect(isRunnableCodeLanguage("bash")).toBe(true);
    expect(isRunnableCodeLanguage("toml")).toBe(false);
  });
});
