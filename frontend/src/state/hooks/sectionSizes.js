import { SIZE_MODE } from "components/Utils/Resizable/utils";
import C from "constants/constants.json";
import { useEffect, useRef, useState } from "react";
import { useSectionInfos } from "state/definitions";
import { useGetSectionInfo } from "./sections";
import { useIsTwitter } from "./social";
import { useGetSectionType } from "./uiTypes";

export const PINNED_PARAMS_AREA_MIN_HEIGHT = 64;
const ROOT_SECTION_HEIGHT = 50;
const MINIMIZE_SECTION_HEIGHT = 32;

export function getMinSectionHeight({
  sectionType,
  hideSearch,
  hideParams,
  isMinimized,
}) {
  if (sectionType === C.SECTION || sectionType === C.REFERENCE_SECTION) {
    if (isMinimized) {
      return MINIMIZE_SECTION_HEIGHT;
    } else if (hideSearch) {
      return 78;
    } else if (hideParams) {
      return 58;
    } else {
      return 104;
    }
  } else if (sectionType === C.LIST_ROOT || sectionType === C.DICT_ROOT) {
    return ROOT_SECTION_HEIGHT;
  } else if (sectionType === C.GLOBAL_VARIABLES) {
    return 50;
  } else if (sectionType === C.CODE || sectionType === C.INTERACTIVE_CODE) {
    return 50;
  } else if (sectionType === C.INFO) {
    return 50;
  } else if (sectionType === C.PARAM_SWEEP) {
    return 50;
  } else if (sectionType === C.TERMINAL) {
    return 50;
  } else if (sectionType === C.GLOBAL_PARAM_SWEEP) {
    return 50;
  } else if (sectionType === C.DRAW || sectionType === C.ARTIFACT) {
    return 100;
  } else if (sectionType === C.SOCIAL) {
    return 50;
  }
}

export function getMaxSectionHeight({ sectionType, hideParams, isMinimized }) {
  if (sectionType === C.SECTION || sectionType === C.REFERENCE_SECTION) {
    if (isMinimized) {
      return MINIMIZE_SECTION_HEIGHT;
    }
  } else if (sectionType === C.LIST_ROOT || sectionType === C.DICT_ROOT) {
    return ROOT_SECTION_HEIGHT;
  }
  // has to be undefined (not null) to allow any height
  return undefined;
}

export function getMinSectionWidth({ isTwitter }) {
  if (isTwitter) {
    // 250 is min width of a tweet. Add 150 for margin
    // https://developer.twitter.com/en/docs/twitter-for-websites/embedded-tweets/guides/embedded-tweet-parameter-reference
    return 400;
  }

  return 200;
}

export function getSizeMode({ sectionType, hideParams, isMinimized }) {
  if (sectionType === C.SECTION || sectionType === C.REFERENCE_SECTION) {
    if (hideParams) {
      return { height: SIZE_MODE.auto_only, width: SIZE_MODE.any };
    }
  }
  // has to be undefined (not null) to allow any height
  return { height: SIZE_MODE.any, width: SIZE_MODE.any };
}

export function useSectionMinMaxDims(sectionId) {
  const sectionType = useGetSectionType(sectionId, "type");
  const hideSearch = useGetSectionInfo(sectionId, "hideSearch");
  const hideParams = useGetSectionInfo(sectionId, "hideParams");
  const isMinimized = useGetSectionInfo(sectionId, "isMinimized");

  const minHeight = getMinSectionHeight({
    sectionType,
    hideSearch,
    hideParams,
    isMinimized,
  });

  const maxHeight = getMaxSectionHeight({
    sectionType,
    hideParams,
    isMinimized,
  });

  const sizeMode = getSizeMode({ sectionType, hideParams, isMinimized });

  return { minHeight, maxHeight, sizeMode };
}

export function useMinSectionWidth(sectionId) {
  const isTwitter = useIsTwitter(sectionId);
  return getMinSectionWidth({ isTwitter });
}

export function useMaxSectionWidth(sectionId) {
  const isTwitter = useIsTwitter(sectionId);
  if (isTwitter) {
    // 550 is max width of a tweet. Add 100 for margin
    // https://developer.twitter.com/en/docs/twitter-for-websites/embedded-tweets/guides/embedded-tweet-parameter-reference
    return undefined;
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
