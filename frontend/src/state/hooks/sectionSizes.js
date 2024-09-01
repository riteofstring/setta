import { useRef } from "react";
import { useGetSectionInfo } from "./sections";
import { useIsTwitter } from "./social";
import { useIsArtifact, useIsRoot } from "./uiTypes";

export function useMinSectionHeight(sectionId) {
  const isOutput = useIsArtifact(sectionId);
  const isRoot = useIsRoot(sectionId);
  const hideSearch = useGetSectionInfo(sectionId, "hideSearch");
  const hideParams = useGetSectionInfo(sectionId, "hideParams");
  const hasTitle = true;
  const hasSearch = !isRoot && !hideSearch;
  const hasKwargControl = !hideParams && !isRoot;

  if (isRoot) {
    return 50;
  }

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

  if (isTwitter) {
    // 250 is min width of a tweet. Add 150 for margin
    // https://developer.twitter.com/en/docs/twitter-for-websites/embedded-tweets/guides/embedded-tweet-parameter-reference
    return 400;
  }

  return 200;
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

export function useOverflow() {
  const ref = useRef();
  return {
    nowheel: ref.current?.scrollHeight > ref.current?.clientHeight,
    ref,
  };
}
