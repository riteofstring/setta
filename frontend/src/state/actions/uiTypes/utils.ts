import { SectionTypeEnum } from "utils/generatedTypes";

export function getIsRoot(sectionTypeName) {
  return [
    SectionTypeEnum.ListRoot,
    SectionTypeEnum.DictRoot,
    SectionTypeEnum.Group,
  ].includes(sectionTypeName);
}
