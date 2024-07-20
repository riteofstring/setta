import { setSectionInfoAttr } from "state/sectionInfos/actions/setters";

export function setSectionVersionsHeight({ sectionId, height }) {
  setSectionInfoAttr({
    sectionId,
    attr: "versionsHeight",
    value: height,
  });
}

export function toggleVersionsVisible(sectionId) {
  setSectionInfoAttr({
    sectionId,
    attr: "versionsVisible",
    newValueFn: (x) => !x,
  });
}
