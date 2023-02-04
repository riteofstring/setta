import { useSectionDescription } from "models/info/sectionDescription";

export function useSectionHasDescription(sectionId) {
  return useSectionDescription((x) => !!x.x[sectionId].value);
}
