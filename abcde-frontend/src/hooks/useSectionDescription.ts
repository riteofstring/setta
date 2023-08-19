import _ from "lodash";
import { useSectionInfos } from "models/info/sectionInfos";
import { setSectionInfoAttr } from "thunks/sections/sections";
import { maybeIncrementProjectStateVersion } from "thunks/undo";

export function useSectionHasDescription(sectionId) {
  return useSectionInfos((x) => !!x.x[sectionId].description);
}

// has to be defined outside of hook to work properly
const debouncedIncrementVersionFn = _.debounce(() => {
  maybeIncrementProjectStateVersion(true);
}, 1000);

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
