import { SectionDescriptionType } from "src/types/sectionDescription";

export function newSectionDescription({
  value = "",
  height,
  visible = false,
}: Partial<SectionDescriptionType> & {
  height: number;
}): SectionDescriptionType {
  return { value, height, visible };
}
