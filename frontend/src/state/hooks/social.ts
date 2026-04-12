import { getCurrEffectiveSectionImpl } from "state/actions/sectionInfos";
import { SectionTypeEnum } from "utils/generatedTypes";

export function getIsTwitterSection(sectionId, state) {
  const impl = getCurrEffectiveSectionImpl(state, sectionId);
  return (
    impl.type === SectionTypeEnum.Social &&
    linkIsTwitter(state.sections[sectionId].social)
  );
}

export function linkIsYouTube(x) {
  return x && (x.includes("youtube") || x.includes("youtu.be"));
}

export function linkIsTwitter(x) {
  return x && (x.includes("twitter") || x.includes("x.com"));
}
