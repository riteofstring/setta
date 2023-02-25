import { useSectionDescription } from "models/info/sectionDescription";
import { useGetSectionConfig } from "./useSectionConfig";

export function useSectionHasDescription(sectionId) {
  const descriptionId = useGetSectionConfig(sectionId, "descriptionId");
  return useSectionDescription((x) => !!x.x[descriptionId].value);
}

export function useGetSectionDescription(sectionId) {
  const descriptionId = useGetSectionConfig(sectionId, "descriptionId");
  return useSectionDescription((x) => x.x[descriptionId].value);
}

export function useGetSectionDescriptionHeight(sectionId) {
  const descriptionId = useGetSectionConfig(sectionId, "descriptionId");
  return useSectionDescription((x) => x.x[descriptionId].height);
}

export function useGetSectionDescriptionVisible(sectionId) {
  const descriptionId = useGetSectionConfig(sectionId, "descriptionId");
  return useSectionDescription((x) => x.x[descriptionId].visible);
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
