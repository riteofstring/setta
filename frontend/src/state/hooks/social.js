import C from "constants/constants.json";
import { useSectionInfos } from "state/definitions";
import { useIsType } from "./uiTypes";

function useIsX(sectionId, fn) {
  const isSocial = useIsType(sectionId, C.SOCIAL);
  const url = useSectionInfos((x) => x.x[sectionId].social);
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
