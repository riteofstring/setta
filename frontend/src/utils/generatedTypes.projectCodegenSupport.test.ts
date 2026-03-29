import {
  CodeObjTypeEnum,
  CodeObjValueRepresentationModeEnum,
  createCodeObjValuePolicy,
  createSectionCodegenPolicy,
  SectionRepresentationModeEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

describe("generated project codegen support", () => {
  it("merges partial policy overrides without discarding canonical defaults", () => {
    const sectionPolicy = createSectionCodegenPolicy({
      allowlist: null,
      typePolicies: {
        [SectionTypeEnum.Callable]: {
          representation: SectionRepresentationModeEnum.file_path,
        },
      },
      sectionOverrides: {
        "section-1": {
          representation: SectionRepresentationModeEnum.file_read,
        },
      },
    });
    const codeObjValuePolicy = createCodeObjValuePolicy({
      typePolicies: {
        [CodeObjTypeEnum.SliderParam]: {
          representation: CodeObjValueRepresentationModeEnum.json_parsed,
        },
      },
    });

    expect(sectionPolicy.allowlist).toBeNull();
    expect(sectionPolicy.typePolicies[SectionTypeEnum.Callable]?.mode).toBe(
      "inherit",
    );
    expect(
      sectionPolicy.typePolicies[SectionTypeEnum.Callable]?.representation,
    ).toBe(SectionRepresentationModeEnum.file_path);
    expect(sectionPolicy.sectionOverrides["section-1"]?.mode).toBe("inherit");
    expect(
      codeObjValuePolicy.typePolicies[CodeObjTypeEnum.SliderParam]
        ?.representation,
    ).toBe(CodeObjValueRepresentationModeEnum.json_parsed);
    expect(
      codeObjValuePolicy.typePolicies[CodeObjTypeEnum.TextParam]
        ?.representation,
    ).toBe(CodeObjValueRepresentationModeEnum.string);
  });
});
