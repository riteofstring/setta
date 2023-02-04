import { SectionDescriptionType } from "src/types/sectionDescription";

export function newSectionDescription({
  value = "",
  height,
}: Partial<SectionDescriptionType> & {
  height: number;
}): SectionDescriptionType {
  return { value, height };
}
