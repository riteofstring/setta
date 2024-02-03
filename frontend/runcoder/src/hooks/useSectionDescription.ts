import { setSectionInfoAttr } from "thunks/sections/setters";

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
