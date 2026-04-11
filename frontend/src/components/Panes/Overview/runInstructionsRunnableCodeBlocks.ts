import { isRunnableCodeLanguage, type CodeLanguage } from "utils/codeLanguage";
import { SectionTypeEnum, type SectionType } from "utils/generatedTypes";

export function isRunnableSectionForCustomRun(
  sectionType: SectionType,
  pythonCodegenEnabled: boolean,
  codeLanguage?: CodeLanguage,
): boolean {
  if (sectionType === SectionTypeEnum.Code) {
    return codeLanguage ? isRunnableCodeLanguage(codeLanguage) : false;
  }
  return pythonCodegenEnabled && sectionType === SectionTypeEnum.GenPythonCode;
}
