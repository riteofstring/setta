import {
  CodeObjTypeEnum,
  CodeObjValueRepresentationModeEnum,
  createCodeObjValuePolicy,
  createProjectCodegenPluginTarget,
  createProjectCodegenPythonTarget,
  createProjectConfig,
  createSectionCodegenPolicy,
  ProjectCodegenLanguageEnum,
  SectionRepresentationModeEnum,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

describe("generated project codegen support", () => {
  it("builds python target defaults from canonical section and code object policies", () => {
    const pythonTarget = createProjectCodegenPythonTarget();

    expect(pythonTarget.language).toBe(ProjectCodegenLanguageEnum.python);
    expect(pythonTarget.genCodePrefix).toBe("");
    expect(pythonTarget.genCodeSuffix).toBe("state = SettaState()");
    expect(pythonTarget.generateMetadata).toBe(false);
    expect(pythonTarget.sectionPolicy.allowlist).toEqual([
      SectionTypeEnum.Callable,
      SectionTypeEnum.Dict,
      SectionTypeEnum.ListRoot,
      SectionTypeEnum.Group,
      SectionTypeEnum.GlobalVariables,
      SectionTypeEnum.TextBlock,
      SectionTypeEnum.Draw,
      SectionTypeEnum.MetaControl,
      SectionTypeEnum.TaskBoard,
      SectionTypeEnum.Spreadsheet,
    ]);
    expect(
      pythonTarget.sectionPolicy.typePolicies[SectionTypeEnum.Chat]
        ?.representation,
    ).toBe(SectionRepresentationModeEnum.file_read);
    expect(
      pythonTarget.codeObjValuePolicy.typePolicies[CodeObjTypeEnum.TextParam]
        ?.representation,
    ).toBe(CodeObjValueRepresentationModeEnum.string);
    expect(
      pythonTarget.codeObjValuePolicy.typePolicies[
        CodeObjTypeEnum.DropzoneParam
      ]?.representation,
    ).toBe(CodeObjValueRepresentationModeEnum.file_path);
  });

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

  it("types project config codegen targets through canonical factories", () => {
    const projectConfig = createProjectConfig({
      codegenTargets: [
        createProjectCodegenPythonTarget(),
        createProjectCodegenPluginTarget({
          language: "setta-fixture-backend-codegen:go",
          options: { packageName: "alpha" },
        }),
      ],
    });

    expect(projectConfig.codegenTargets).toHaveLength(2);
    expect(projectConfig.codegenTargets[0]?.language).toBe(
      ProjectCodegenLanguageEnum.python,
    );
    expect(projectConfig.codegenTargets[1]).toEqual({
      language: "setta-fixture-backend-codegen:go",
      options: { packageName: "alpha" },
    });
  });
});
