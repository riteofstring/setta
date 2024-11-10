import { useGetSectionInfo } from "./sections";
import { useIsSocial } from "./uiTypes";

export const youtubeSectionAspectRatio = 16 / 9;

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
  return x && (x.includes("youtube") || x.includes("youtu.be"));
}

export function linkIsTwitter(x) {
  return x && (x.includes("twitter") || x.includes("x.com"));
}
