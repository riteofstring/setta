import { useGetSectionInfo } from "./useGetSectionInfo";
import { useIsSocial } from "./useUITypes";

// youtube is 16/9. Make it 16/12 because of padding
export const youtubeSectionAspectRatio = 16 / 12;

function useIsX(sectionId, fn) {
  const isSocial = useIsSocial(sectionId);
  const url = useGetSectionInfo(sectionId, "social");
  return isSocial && fn(url);
}

export function useIsTwitter(sectionId) {
  return useIsX(sectionId, linkIsTwitter);
}

export function useIsYouTube(sectionId) {
  return useIsX(sectionId, linkIsYouTube);
}

export function linkIsYouTube(x) {
  return x && x.includes("youtube");
}

export function linkIsTwitter(x) {
  return x && x.includes("twitter");
}
