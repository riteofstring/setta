import { CodeLanguageEnum, SectionTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { isRunnableSectionForCustomRun } from "./runInstructionsRunnableCodeBlocks";

describe("isRunnableSectionForCustomRun", () => {
  it("only treats runnable code languages as runnable code blocks", () => {
    expect(
      isRunnableSectionForCustomRun(
        SectionTypeEnum.Code,
        false,
        CodeLanguageEnum.python,
      ),
    ).toBe(true);
    expect(
      isRunnableSectionForCustomRun(
        SectionTypeEnum.Code,
        false,
        CodeLanguageEnum.bash,
      ),
    ).toBe(true);
    expect(
      isRunnableSectionForCustomRun(
        SectionTypeEnum.Code,
        false,
        CodeLanguageEnum.json,
      ),
    ).toBe(false);
    expect(
      isRunnableSectionForCustomRun(
        SectionTypeEnum.Code,
        false,
        CodeLanguageEnum.yaml,
      ),
    ).toBe(false);
    expect(
      isRunnableSectionForCustomRun(
        SectionTypeEnum.Code,
        false,
        CodeLanguageEnum.toml,
      ),
    ).toBe(false);
  });

  it("only treats generated python as runnable when python codegen is enabled", () => {
    expect(
      isRunnableSectionForCustomRun(SectionTypeEnum.GenPythonCode, true),
    ).toBe(true);
    expect(
      isRunnableSectionForCustomRun(SectionTypeEnum.GenPythonCode, false),
    ).toBe(false);
  });

  it("treats code sections with missing language as non-runnable", () => {
    expect(isRunnableSectionForCustomRun(SectionTypeEnum.Code, false)).toBe(
      false,
    );
  });
});
