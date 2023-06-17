import { SectionDescriptionType } from "abcde-utils/src/types/sectionDescription";
import _ from "lodash";
import { useSectionDescription } from "models/info/sectionDescription";
import { maybeIncrementProjectStateVersion } from "thunks/undo";
import { useGetSectionInfo } from "./useSectionInfo";

export function useGetSectionDescription<
  K extends keyof SectionDescriptionType
>(sectionId: string, key: K) {
  const descriptionId = useGetSectionInfo(sectionId, "descriptionId");
  return useSectionDescription((x) => x.x[descriptionId][key]);
}

export function useSectionHasDescription(sectionId) {
  const descriptionId = useGetSectionInfo(sectionId, "descriptionId");
  return useSectionDescription((x) => !!x.x[descriptionId].value);
}

// has to be defined outside of hook to work properly
const debouncedIncrementVersionFn = _.debounce(() => {
  maybeIncrementProjectStateVersion(true);
}, 1000);

export function useSetSectionDescription(sectionId) {
  const descriptionId = useGetSectionInfo(sectionId, "descriptionId");
  const setDescription = useSectionDescription((x) => x.setDescription);

  return (value) => {
    setDescription({ descriptionId, value });
    debouncedIncrementVersionFn();
  };
}

export function useSetSectionDescriptionHeight(sectionId) {
  const descriptionId = useGetSectionInfo(sectionId, "descriptionId");
  const setHeight = useSectionDescription((x) => x.setHeight);
  return (height) => setHeight({ descriptionId, height });
}

export function useToggleSectionDescription(sectionId) {
  const descriptionId = useGetSectionInfo(sectionId, "descriptionId");
  const toggleVisible = useSectionDescription((x) => x.toggleVisible);
  return () => toggleVisible({ descriptionId });
}
