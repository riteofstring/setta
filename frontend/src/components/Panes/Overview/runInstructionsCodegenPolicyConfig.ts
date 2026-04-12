import {
  PythonCodegenPolicyUIConfig,
  type CodeObjType,
  type CodeObjValueRepresentationMode,
  type SectionRepresentationMode,
  type SectionType,
} from "utils/generatedTypes";

export const RUN_INSTRUCTIONS_CODEGEN_SECTION_TYPES =
  PythonCodegenPolicyUIConfig.sectionTypes;

export const RUN_INSTRUCTIONS_CODEGEN_META_CONTROL_CODE_OBJ_TYPES =
  PythonCodegenPolicyUIConfig.metaControlCodeObjTypes;

export const RUN_INSTRUCTIONS_CODEGEN_CODE_OBJ_TYPES =
  PythonCodegenPolicyUIConfig.codeObjTypes;

export const RUN_INSTRUCTIONS_CODEGEN_SECTION_MODE_OPTIONS =
  PythonCodegenPolicyUIConfig.sectionModeOptions.map((value) => ({
    value,
    label: value,
  }));

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
