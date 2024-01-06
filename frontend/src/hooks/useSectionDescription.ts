import { useSectionInfos } from "models/info/sectionInfos";
import { setSectionInfoAttr } from "thunks/sections/setters";

export function useSectionHasDescription(sectionId) {
  return useSectionInfos((x) => !!x.x[sectionId].description);
}

export function setSectionDescriptionHeight({ sectionId, height }) {
  setSectionInfoAttr({
    sectionId,
    attr: "descriptionHeight",
    value: height,
  });
}

export function toggleSectionDescription(sectionId) {
  setSectionInfoAttr({
    sectionId,
    attr: "descriptionVisible",
    newValueFn: (x) => !x,
  });
}
