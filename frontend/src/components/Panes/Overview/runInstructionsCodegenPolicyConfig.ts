import {
  PythonCodegenPolicyUIConfig,
  type CodeObjType,
  type CodeObjValueRepresentationMode,
  type SectionRepresentationMode,
  type SectionType,
} from "utils/generatedTypes";

const sectionRepresentationOptionsByType = new Map<
  SectionType,
  readonly SectionRepresentationMode[]
>(
  Object.entries(
    PythonCodegenPolicyUIConfig.sectionRepresentationOptionsByType,
  ) as Array<[SectionType, readonly SectionRepresentationMode[]]>,
);

const codeObjRepresentationOptionsByType = new Map<
  CodeObjType,
  readonly CodeObjValueRepresentationMode[]
>(
  Object.entries(
    PythonCodegenPolicyUIConfig.codeObjRepresentationOptionsByType,
  ) as Array<[CodeObjType, readonly CodeObjValueRepresentationMode[]]>,
);

export function getRunInstructionsSectionRepresentationOptions(
  sectionType: SectionType | null,
): readonly SectionRepresentationMode[] {
  if (!sectionType) {
    return PythonCodegenPolicyUIConfig.defaultSectionRepresentationOptions;
  }
  return (
    sectionRepresentationOptionsByType.get(sectionType) ??
    PythonCodegenPolicyUIConfig.defaultSectionRepresentationOptions
  );
}

export function getRunInstructionsCodeObjRepresentationOptions(
  codeObjType: CodeObjType | null,
): readonly CodeObjValueRepresentationMode[] {
  if (!codeObjType) {
    return PythonCodegenPolicyUIConfig.defaultCodeObjRepresentationOptions;
  }
  return (
    codeObjRepresentationOptionsByType.get(codeObjType) ??
    PythonCodegenPolicyUIConfig.defaultCodeObjRepresentationOptions
  );
}
