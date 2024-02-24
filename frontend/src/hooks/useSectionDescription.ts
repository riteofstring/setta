import { setSectionInfoAttr } from "thunks/sections/setters";

export function setSectionVersionsHeight({ sectionId, height }) {
  setSectionInfoAttr({
    sectionId,
    attr: "versionsHeight",
    value: height,
  });
}

export function toggleSectionDescription(sectionId) {
  setSectionInfoAttr({
    sectionId,
    attr: "versionsVisible",
    newValueFn: (x) => !x,
  });
}
