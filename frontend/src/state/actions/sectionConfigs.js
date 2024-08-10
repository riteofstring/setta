import { useSectionConfigs } from "state/definitions";

export function setAllSectionConfigs(x) {
  useSectionConfigs.setState({ x });
}

export function setSectionSize(sectionId, size) {
  setSectionConfigAttr({ sectionId, attr: "size", value: size });
}

export function setSectionConfigAttr({
  sectionId,
  sectionIds,
  attr,
  value,
  newValueFn,
}) {
  useSectionConfigs.setState((state) => {
    if (sectionIds) {
      sectionIds.forEach((id) => {
        valueOrNewValueFn({
          obj: state.x[id],
          attr,
          value,
          newValueFn,
        });
      });
    } else if (sectionId) {
      valueOrNewValueFn({
        obj: state.x[sectionId],
        attr,
        value,
        newValueFn,
      });
    }
  });
}
