import { getSectionType } from "state/actions/sectionInfos";
import { UITypeNameEnum } from "utils/generatedTypes";

export function getIsTwitterSection(sectionId, state) {
  return (
    getSectionType(sectionId) === UITypeNameEnum.SOCIAL &&
    linkIsTwitter(state.sections[sectionId].social)
  );
}

export function getIsYouTubeSection(sectionId, state) {
  return (
    getSectionType(sectionId) === UITypeNameEnum.SOCIAL &&
    linkIsYouTube(state.sections[sectionId].social)
  );
}

export function linkIsYouTube(x) {
  return x && (x.includes("youtube") || x.includes("youtu.be"));
}

export function linkIsTwitter(x) {
  return x && (x.includes("twitter") || x.includes("x.com"));
}
