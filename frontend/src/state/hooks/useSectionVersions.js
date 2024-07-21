import { setSectionInfoAttr } from "state/actions/sectionInfos";

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
