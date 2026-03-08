import {
  CodeLanguageEnum,
  CodeObjTypeEnum,
  ConfigLanguageEnum,
  createCallableSectionImpl,
  createCodeParamCodeObjImpl,
  createCodeSectionImpl,
  createTextBlockSectionImpl,
  createUserDefaultCallableSectionImpl,
  createUserDefaultCodeParamCodeObjImpl,
  createUserDefaultCodeSectionImpl,
  ParamNameTypeEnum,
  SectionTypeEnum,
  TextBlockFormatEnum,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

describe("generated project state factories", () => {
  it("treats a single argument with type/id as section impl overrides", () => {
    const sectionImpl = createTextBlockSectionImpl({
      id: "text-impl",
      type: SectionTypeEnum.TextBlock,
      text: "Hello",
      format: TextBlockFormatEnum.Markdown,
    });

    expect(sectionImpl.id).toBe("text-impl");
    expect(sectionImpl.type).toBe(SectionTypeEnum.TextBlock);
    expect(sectionImpl.text).toBe("Hello");
    expect(sectionImpl.format).toBe(TextBlockFormatEnum.Markdown);
    expect(sectionImpl.size).toEqual({ width: 500, height: 150 });
  });

  it("applies explicit user defaults before section impl overrides", () => {
    const sectionImpl = createCodeSectionImpl(
      createUserDefaultCodeSectionImpl({
        code: "echo hi",
        codeLanguage: CodeLanguageEnum.bash,
      }),
      {
        id: "code-impl",
        children: ["terminal-1"],
      },
    );

    expect(sectionImpl.id).toBe("code-impl");
    expect(sectionImpl.type).toBe(SectionTypeEnum.Code);
    expect(sectionImpl.code).toBe("echo hi");
    expect(sectionImpl.codeLanguage).toBe(CodeLanguageEnum.bash);
    expect(sectionImpl.children).toEqual(["terminal-1"]);
  });

  it("builds callable and code-param helpers from canonical defaults", () => {
    const callableImpl = createCallableSectionImpl(
      createUserDefaultCallableSectionImpl({
        hideParams: true,
        configLanguage: ConfigLanguageEnum.json,
      }),
      {
        id: "callable-impl",
        callable: "callable-code-obj",
      },
    );
    const codeParamImpl = createCodeParamCodeObjImpl(
      createUserDefaultCodeParamCodeObjImpl({
        coreNameType: ParamNameTypeEnum.TEXT,
        value: "5",
      }),
      {
        id: "param-impl",
      },
    );

    expect(callableImpl.type).toBe(SectionTypeEnum.Callable);
    expect(callableImpl.hideParams).toBe(true);
    expect(callableImpl.configLanguage).toBe(ConfigLanguageEnum.json);
    expect(callableImpl.callable).toBe("callable-code-obj");

    expect(codeParamImpl.type).toBe(CodeObjTypeEnum.CodeParam);
    expect(codeParamImpl.id).toBe("param-impl");
    expect(codeParamImpl.coreNameType).toBe(ParamNameTypeEnum.TEXT);
    expect(codeParamImpl.value).toBe("5");
  });
});
