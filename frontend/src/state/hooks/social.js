import C from "constants/constants.json";
import { getSectionType } from "state/actions/sectionInfos";
import { useSectionInfos } from "state/definitions";
import { useIsType } from "./uiTypes";

function useIsX(sectionId, fn) {
  const isSocial = useIsType(sectionId, C.SOCIAL);
  const url = useSectionInfos((x) => x.x[sectionId].social);
  return isSocial && fn(url);
}

export function useIsYouTube(sectionId) {
  return useIsX(sectionId, linkIsYouTube);
}

export function getIsTwitterSection(sectionId, state) {
  return (
    getSectionType(sectionId) === C.SOCIAL &&
    linkIsTwitter(state.x[sectionId].social)
  );
}

export function linkIsYouTube(x) {
  return x && (x.includes("youtube") || x.includes("youtu.be"));
}

export function linkIsTwitter(x) {
  return x && (x.includes("twitter") || x.includes("x.com"));
}
