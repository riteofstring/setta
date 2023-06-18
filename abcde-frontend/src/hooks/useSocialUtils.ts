import { useGetSectionTypeConfig, useIsSocial } from "./useSectionType";

// youtube is 16/9. Make it 16/12 because of padding
export const youtubeSectionAspectRatio = 16 / 12;

function useIsX(sectionId, x) {
  const isSocial = useIsSocial(sectionId);
  const selectedSocial = useGetSectionTypeConfig(sectionId, "social");
  return isSocial && selectedSocial === x;
}

export function useIsTwitter(sectionId) {
  return useIsX(sectionId, "twitter");
}

export function useIsYouTube(sectionId) {
  return useIsX(sectionId, "youtube");
}
