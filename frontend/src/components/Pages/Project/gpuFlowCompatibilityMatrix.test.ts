import {
  CodeObjTypeEnum,
  SectionTypeEnum,
  type CodeObjType,
  type SectionType,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  getGpuFlowParamCompatibilityMatrix,
  getGpuFlowSectionCompatibilityMatrix,
} from "./gpuFlowCompatibilityMatrix";

function sorted<T extends string>(values: readonly T[]): T[] {
  return [...values].sort();
}

describe("gpuFlowCompatibilityMatrix", () => {
  it("covers every generated section type with an owner renderer and compatibility expectation", () => {
    const matrix = getGpuFlowSectionCompatibilityMatrix();

    expect(sorted(matrix.map((entry) => entry.sectionType))).toEqual(
      sorted(Object.values(SectionTypeEnum) as SectionType[]),
    );
    expect(
      matrix
        .filter((entry) => !entry.hasAreaRenderer)
        .map((entry) => entry.sectionType),
    ).toEqual([]);
    expect(
      matrix
        .filter((entry) => !entry.hasCompatibilityExpectation)
        .map((entry) => entry.sectionType),
    ).toEqual([]);
    expect(
      matrix
        .filter((entry) => entry.nativeInteractions.length === 0)
        .map((entry) => entry.sectionType),
    ).toEqual([]);
    expect(
      matrix
        .filter((entry) => entry.canvasInteractions.length === 0)
        .map((entry) => entry.sectionType),
    ).toEqual([]);
  });

  it("records high-risk section live DOM families explicitly", () => {
    const matrix = new Map(
      getGpuFlowSectionCompatibilityMatrix().map((entry) => [
        entry.sectionType,
        entry,
      ]),
    );

    expect(matrix.get(SectionTypeEnum.Code)?.nativeInteractions).toContain(
      "code editing",
    );
    expect(matrix.get(SectionTypeEnum.Terminal)?.nativeInteractions).toContain(
      "terminal input",
    );
    expect(matrix.get(SectionTypeEnum.Chat)?.nativeInteractions).toContain(
      "chat input",
    );
    expect(
      matrix.get(SectionTypeEnum.Spreadsheet)?.nativeInteractions,
    ).toContain("spreadsheet editing");
    expect(
      matrix.get(SectionTypeEnum.MetaControl)?.nativeInteractions,
    ).toContain("control first interaction");
  });

  it("covers every generated code object type with explicit param compatibility expectations", () => {
    const matrix = getGpuFlowParamCompatibilityMatrix();

    expect(sorted(matrix.map((entry) => entry.codeObjType))).toEqual(
      sorted(Object.values(CodeObjTypeEnum) as CodeObjType[]),
    );
    expect(
      matrix
        .filter((entry) => !entry.hasCompatibilityExpectation)
        .map((entry) => entry.codeObjType),
    ).toEqual([]);
    expect(
      matrix
        .filter((entry) => entry.surfaces.length === 0)
        .map((entry) => entry.codeObjType),
    ).toEqual([]);
  });

  it("derives param surface ownership from the existing ParamUI, MetaControl, and nested-container owners", () => {
    const matrix = new Map(
      getGpuFlowParamCompatibilityMatrix().map((entry) => [
        entry.codeObjType,
        entry,
      ]),
    );

    expect(
      matrix.get(CodeObjTypeEnum.TextParam)?.sectionParamUIRendererFamily,
    ).toBe("text-like");
    expect(
      matrix.get(CodeObjTypeEnum.DateParam)?.metaControlRendererFamily,
    ).toBe("date-time");
    expect(
      matrix.get(CodeObjTypeEnum.ButtonParam)?.hasSectionParamUIRenderer,
    ).toBe(true);
    expect(
      matrix.get(CodeObjTypeEnum.ButtonParam)?.sectionParamUIRendererFamily,
    ).toBe("button");
    expect(
      matrix.get(CodeObjTypeEnum.ButtonParam)?.metaControlRendererFamily,
    ).toBe("button");
    expect(
      matrix.get(CodeObjTypeEnum.NestedParam)?.hasStructuralContainer,
    ).toBe(true);
    expect(matrix.get(CodeObjTypeEnum.CodeCallable)?.surfaces).toEqual([
      "callable-section",
    ]);
  });
});
