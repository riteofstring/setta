import { useSectionInfos } from "models/info/sectionInfos";
import { setSectionInfoAttr } from "thunks/sections/setters";
import { debouncedIncrementVersionFn } from "thunks/undo";

export function useSectionHasDescription(sectionId) {
  return useSectionInfos((x) => !!x.x[sectionId].description);
}

export function useSetSectionDescription(sectionId) {
  const setDescription = useSectionInfos((x) => x.setSectionInfoAttr);

  return (value) => {
    setDescription({ sectionId, attr: "description", value });
    debouncedIncrementVersionFn();
  };
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
