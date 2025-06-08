import { getSectionType } from "state/actions/sectionInfos";
import { UITypeNameSchema } from "utils/generatedTypes";

export function getIsTwitterSection(sectionId, state) {
  return (
    getSectionType(sectionId) === UITypeNameSchema.enum.SOCIAL &&
    linkIsTwitter(state.sections[sectionId].social)
  );
}

export function getIsYouTubeSection(sectionId, state) {
  return (
    getSectionType(sectionId) === UITypeNameSchema.enum.SOCIAL &&
    linkIsYouTube(state.sections[sectionId].social)
  );
}

export function linkIsYouTube(x) {
  return x && (x.includes("youtube") || x.includes("youtu.be"));
}

export function linkIsTwitter(x) {
  return x && (x.includes("twitter") || x.includes("x.com"));
}
