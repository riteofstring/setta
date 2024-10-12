import { SIZE_MODE } from "components/Utils/Resizable/utils";
import C from "constants/constants.json";
import { useEffect, useRef, useState } from "react";
import {
  adjustAspectRatio,
  adjustSizeToBeAtLeastMin,
} from "state/actions/sections/sectionSizes";
import {
  setAspectRatioInfo,
  setSectionSize,
} from "state/actions/sections/setters";
import { useSectionInfos } from "state/definitions";
import { getImageDimensionsFromBase64 } from "utils/utils";
import { useGetSectionInfo } from "./sections";
import { useGetSectionType } from "./uiTypes";

export const INFINITE_MAX_HEIGHT = 100000;
const INFINITE_MAX_WIDTH = 100000;
export const PINNED_PARAMS_AREA_MIN_HEIGHT = 64;
const ROOT_SECTION_HEIGHT = 50;
const MINIMIZE_SECTION_HEIGHT = 32;

export function getMinSectionHeight({
  sectionType,
  hideSearch,
  hideParams,
  isMinimized,
}) {
  if (isMinimized) {
    return MINIMIZE_SECTION_HEIGHT;
  }

  if (sectionType === C.SECTION || sectionType === C.REFERENCE_SECTION) {
    if (hideSearch) {
      return 78;
    } else if (hideParams) {
      return 58;
    } else {
      return 104;
    }
  } else if (sectionType === C.LIST_ROOT || sectionType === C.DICT_ROOT) {
    return ROOT_SECTION_HEIGHT;
  } else if (sectionType === C.GLOBAL_VARIABLES) {
    return 78;
  } else if (sectionType === C.CODE || sectionType === C.INTERACTIVE_CODE) {
    return 58.2;
  } else if (sectionType === C.INFO) {
    return 98;
  } else if (sectionType === C.PARAM_SWEEP) {
    return 50;
  } else if (sectionType === C.TERMINAL) {
    return 100;
  } else if (sectionType === C.GLOBAL_PARAM_SWEEP) {
    return 112;
  } else if (sectionType === C.DRAW || sectionType === C.ARTIFACT) {
    return 100;
  } else if (sectionType === C.SOCIAL) {
    return 50;
  }
}

export function getMaxSectionHeight({ sectionType, isMinimized }) {
  if (isMinimized) {
    return MINIMIZE_SECTION_HEIGHT;
  }
  if (sectionType === C.LIST_ROOT || sectionType === C.DICT_ROOT) {
    return ROOT_SECTION_HEIGHT;
  }
  return INFINITE_MAX_HEIGHT;
}

export function getMinSectionWidth({ sectionType }) {
  // if (isTwitter) {
  //   // 250 is min width of a tweet. Add 150 for margin
  //   // https://developer.twitter.com/en/docs/twitter-for-websites/embedded-tweets/guides/embedded-tweet-parameter-reference
  //   return 400;
  // }
  if (sectionType === C.DRAW) {
    return 272;
  }

  return 200;
}

export function getMaxSectionWidth() {
  // const isTwitter = useIsTwitter(sectionId);
  // if (isTwitter) {
  //   // 550 is max width of a tweet. Add 100 for margin
  //   // https://developer.twitter.com/en/docs/twitter-for-websites/embedded-tweets/guides/embedded-tweet-parameter-reference
  //   return undefined;
  // }
  return INFINITE_MAX_WIDTH;
}

export function getSizeMode({ sectionType, hideParams, isMinimized }) {
  if (sectionType === C.SECTION || sectionType === C.REFERENCE_SECTION) {
    if (hideParams) {
      return { height: SIZE_MODE.auto_only, width: SIZE_MODE.any };
    }
  }
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
    isMinimized,
  });

  const minWidth = getMinSectionWidth({ sectionType });
  const maxWidth = getMaxSectionWidth();

  const sizeMode = getSizeMode({ sectionType, hideParams, isMinimized });

  return { minHeight, maxHeight, minWidth, maxWidth, sizeMode };
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

export async function setImgArtifactSectionSizeOnLoad(sectionId, imgSize) {
  const imgSize = await getImageDimensionsFromBase64(base64String);
  const minHeight = getMinSectionHeight({
    sectionType: C.ARTIFACT,
  });
  const minWidth = getMinSectionWidth({});
  const currSize = useSectionInfos.getState().x[sectionId].size;

  let adjustedSize = adjustAspectRatio(
    currSize.height,
    currSize.width,
    imgSize.height,
    imgSize.width,
  );
  adjustedSize = adjustSizeToBeAtLeastMin(
    adjustedSize.height,
    adjustedSize.width,
    minHeight,
    minWidth,
  );

  const extraHeight = 24;
  adjustedSize.height += extraHeight;
  setSectionSize(sectionId, adjustedSize);
  setAspectRatioInfo({
    sectionId,
    aspectRatio: imgSize.width / imgSize.height,
    aspectRatioExtraHeight: extraHeight,
  });
}

export function setDrawAreaSectionSize({ sectionId, imgSize, isNewImg }) {
  let canvasSize = {};
  const extraHeight = 120;
  const extraWidth = 24;

  const { width, height } = useSectionInfos.getState().x[sectionId].size;
  if (imgSize) {
    if (width === "auto" || height === "auto" || isNewImg) {
      canvasSize.width = imgSize.width;
      canvasSize.height = imgSize.height;
      setSectionSize(sectionId, {
        width: imgSize.width + extraWidth,
        height: imgSize.height + extraHeight,
      });
    } else {
      canvasSize.width = width - extraWidth;
      canvasSize.height = height - extraHeight;
    }

    if (isNewImg) {
      setAspectRatioInfo({
        sectionId,
        aspectRatio: imgSize.width / imgSize.height,
        aspectRatioExtraHeight: extraHeight,
        aspectRatioExtraWidth: extraWidth,
      });
    }
  } else {
    const [defaultWidth, defaultHeight] = [500, 500];
    canvasSize.width = width === "auto" ? defaultWidth : width - extraWidth;
    canvasSize.height =
      height === "auto" ? defaultHeight : height - extraHeight;
    if (width === "auto" || height === "auto") {
      setSectionSize(sectionId, {
        width: canvasSize.width + extraWidth,
        height: canvasSize.height + extraHeight,
      });
    }
  }

  return canvasSize;
}
