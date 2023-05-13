import { SectionDescriptionType } from "abcde-utils/src/types/sectionDescription";
import { useSectionDescription } from "models/info/sectionDescription";
import { useGetSectionConfig } from "./useSectionConfig";

export function useGetSectionDescription<
  K extends keyof SectionDescriptionType
>(sectionId: string, key: K) {
  const descriptionId = useGetSectionConfig(sectionId, "descriptionId");
  return useSectionDescription((x) => x.x[descriptionId][key]);
}

export function useSectionHasDescription(sectionId) {
  const descriptionId = useGetSectionConfig(sectionId, "descriptionId");
  return useSectionDescription((x) => !!x.x[descriptionId].value);
}

export function useSetSectionDescription(sectionId) {
  const descriptionId = useGetSectionConfig(sectionId, "descriptionId");
  const setDescription = useSectionDescription((x) => x.setDescription);
  return (value) => setDescription({ descriptionId, value });
}

export function useSetSectionDescriptionHeight(sectionId) {
  const descriptionId = useGetSectionConfig(sectionId, "descriptionId");
  const setHeight = useSectionDescription((x) => x.setHeight);
  return (height) => setHeight({ descriptionId, height });
}

export function useToggleSectionDescription(sectionId) {
  const descriptionId = useGetSectionConfig(sectionId, "descriptionId");
  const toggleVisible = useSectionDescription((x) => x.toggleVisible);
  return () => toggleVisible({ descriptionId });
}
