import { useEffect, useRef, useState } from "react";
import { useSectionInfos } from "state/definitions";
import useDeepCompareEffect from "use-deep-compare-effect";
import { useTopLevelParamInfos } from "./sectionContents";
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

export function useOverflow(sectionId) {
  const ref = useRef();
  const resizeEvent = useSectionInfos((x) => x.x[sectionId].resizeEvent);
  const [didUpdate, setDidUpdate] = useState(false);
  const [overflow, setOverflow] = useState(false);

  // Add overflow whenever resizing.
  // Add the end of resizing, compare scrollHeight to clientHeight and remove overflow if scrollHeight <= clientHeight
  useEffect(() => {
    if (resizeEvent === "start") {
      setOverflow(true);
    } else if (resizeEvent === "end") {
      setOverflow(ref.current.scrollHeight > ref.current.clientHeight);
    }
  }, [resizeEvent]);

  // If params update (didUpdate goes from false->true), overflow may be needed. So set overflow to true
  // Then set didUpdate to false.
  // Then detect didUpdate going from true->false and check if overflow is actually needed
  // TODO: find better way to do this?
  useEffect(() => {
    if (didUpdate) {
      setOverflow(true);
      setDidUpdate(false);
    } else {
      setOverflow(ref.current.scrollHeight > ref.current.clientHeight);
    }
  }, [didUpdate]);

  return { overflow, ref, setDidUpdate };
}

export function useParamsDidUpdate({ sectionId, setDidUpdate, isPinned }) {
  const params = useTopLevelParamInfos(sectionId, isPinned);
  useDeepCompareEffect(() => {
    setDidUpdate(true);
  }, [params]);

  return params.map((x) => x.id);
}
