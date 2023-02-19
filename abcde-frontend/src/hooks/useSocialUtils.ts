import { useGetSectionTypeConfig, useIsSocial } from "./useSectionType";

export function useIsTwitter(sectionId) {
  const isSocial = useIsSocial(sectionId);
  const selectedSocial = useGetSectionTypeConfig(sectionId, "social");
  return isSocial && selectedSocial === "twitter";
}
