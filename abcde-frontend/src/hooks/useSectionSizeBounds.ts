import { SECTIONWIDTH } from "utils/constants";
import { useAreAllParamsNested } from "./useParamUIType";
import { useGetAllCallables, useGetParamInfos } from "./useSectionContents";
import { useIsOutput, useIsRoot } from "./useSectionType";
import { useIsTwitter } from "./useSocialUtils";

export function useMinSectionHeight(sectionId) {
  const isOutput = useIsOutput(sectionId);
  const isRoot = useIsRoot(sectionId);
  const hasTitle = true;
  const hasSearch = useGetAllCallables(sectionId).length > 0 && !isRoot;
  const params = useGetParamInfos(sectionId);
  const hasUnnestedParam = !useAreAllParamsNested(sectionId, params);
  const hasKwargControl = !isRoot;

  if (isOutput) {
    return 300;
  }

  return (
    (hasTitle ? 56 : 0) +
    (hasSearch ? 48 : 0) +
    (hasUnnestedParam ? 52 : 0) +
    (hasKwargControl ? 34 : 0)
    // (hasInfo ? 64 : 0)
  );
}

export function useMinSectionWidth(sectionId) {
  const isTwitter = useIsTwitter(sectionId);

  if (isTwitter) {
    // 250 is min width of a tweet. Add 150 for margin
    // https://developer.twitter.com/en/docs/twitter-for-websites/embedded-tweets/guides/embedded-tweet-parameter-reference
    return 400;
  }
  return SECTIONWIDTH;
}

export function useMaxSectionWidth(sectionId) {
  const isTwitter = useIsTwitter(sectionId);
  if (isTwitter) {
    // 550 is max width of a tweet. Add 100 for margin
    // https://developer.twitter.com/en/docs/twitter-for-websites/embedded-tweets/guides/embedded-tweet-parameter-reference
    return 650;
  }
  return undefined;
}
