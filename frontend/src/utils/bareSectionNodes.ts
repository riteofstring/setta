import { SectionTypeEnum, type SectionType } from "./generatedTypes";

const BARE_SECTION_NODE_TYPES = new Set<SectionType>([
  SectionTypeEnum.Callable,
  SectionTypeEnum.Dict,
]);

export const BARE_SECTION_NODE_MIN_HEIGHT = 36;
export const BARE_SECTION_NODE_MIN_WIDTH = 160;

export function isBareSectionNodeType(sectionType: SectionType): boolean {
  return BARE_SECTION_NODE_TYPES.has(sectionType);
}
