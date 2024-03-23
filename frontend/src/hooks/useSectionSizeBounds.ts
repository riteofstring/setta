import { SECTIONWIDTH } from "utils/constants";
import { CODE, VAR_CONTROL } from "z_utils/constants";
import { useGetAllCallables } from "./useSectionContents";
import {
  useIsOneOfType,
  useIsOutput,
  useIsRoot,
  useIsTerminal,
} from "./useSectionType";
import { useIsTwitter } from "./useSocialUtils";

export function useMinSectionHeight(sectionId) {
  const isOutput = useIsOutput(sectionId);
  const isRoot = useIsRoot(sectionId);
  const hasTitle = true;
  const hasSearch = useGetAllCallables(sectionId).length > 0 && !isRoot;
  const hasKwargControl = !isRoot;

  if (isOutput) {
    return 300;
  }

  return (
    (hasTitle ? 56 : 0) + (hasSearch ? 48 : 0) + 52 + (hasKwargControl ? 34 : 0)
    // (hasInfo ? 64 : 0)
  );
}

export function useMinSectionWidth(sectionId) {
  const isTwitter = useIsTwitter(sectionId);
  const isTerminal = useIsTerminal(sectionId);
  const containsCode = useIsOneOfType(sectionId, [CODE, VAR_CONTROL]);

  if (isTwitter) {
    // 250 is min width of a tweet. Add 150 for margin
    // https://developer.twitter.com/en/docs/twitter-for-websites/embedded-tweets/guides/embedded-tweet-parameter-reference
    return 400;
  }
  if (isTerminal) {
    return 700;
  }
  if (containsCode) {
    return 500;
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
