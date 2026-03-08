import { SectionType, SectionTypeEnum } from "utils/generatedTypes";

const rootTypes = new Set([SectionTypeEnum.ListRoot, SectionTypeEnum.Group]);

export function getIsRoot(type: SectionType) {
  // @ts-expect-error 'has' is not well typed
  return rootTypes.has(type);
}
