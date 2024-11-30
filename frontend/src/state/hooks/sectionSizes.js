import { SIZE_MODE } from "components/Utils/Resizable/utils";
import C from "constants/constants.json";
import _ from "lodash";
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
import { getSectionType } from "state/getters/sectionInfo";
import { getImageDimensionsFromBase64 } from "utils/utils";
import { useGetSectionInfo } from "./sections";
import { useIsTwitter } from "./social";
import { useSectionType } from "./uiTypes";

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
  } else if (sectionType === C.DRAW || sectionType === C.IMAGE) {
    return 100;
  } else if (sectionType === C.LINE_PLOT) {
    return 300;
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

export function getMinSectionWidth({ sectionType, isTwitter }) {
  if (isTwitter) {
    return 370;
  }
  if (sectionType === C.DRAW) {
    return 402;
  } else if (sectionType === C.LINE_PLOT) {
    return 300;
  }

  return 200;
}

export function getMaxSectionWidth({ isTwitter }) {
  if (isTwitter) {
    return 574;
  }
  return INFINITE_MAX_WIDTH;
}

export function getSizeMode({ sectionType, hideParams, isTwitter }) {
  if (sectionType === C.SECTION || sectionType === C.REFERENCE_SECTION) {
    if (hideParams) {
      return { height: SIZE_MODE.auto_only, width: SIZE_MODE.any };
    }
  } else if (sectionType === C.TERMINAL) {
    return { height: SIZE_MODE.manual_only, width: SIZE_MODE.manual_only };
  }
  if (isTwitter) {
    return { height: SIZE_MODE.auto_only, width: SIZE_MODE.any };
  }
  return { height: SIZE_MODE.any, width: SIZE_MODE.any };
}

export function useSectionMinMaxDims(sectionId) {
  const sectionType = useSectionType(sectionId, "type");
  const hideSearch = useGetSectionInfo(sectionId, "hideSearch");
  const hideParams = useGetSectionInfo(sectionId, "hideParams");
  const isMinimized = useGetSectionInfo(sectionId, "isMinimized");
  const isTwitter = useIsTwitter(sectionId);

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

  const minWidth = getMinSectionWidth({ sectionType, isTwitter });
  const maxWidth = getMaxSectionWidth({ isTwitter });

  const sizeMode = getSizeMode({ sectionType, hideParams, isTwitter });

  return { minHeight, maxHeight, minWidth, maxWidth, sizeMode };
}

export function useIsScrollable() {
  const [isScrollable, setIsScrollable] = useState(false);
  const elementRef = useRef(null);

  useEffect(() => {
    if (!elementRef.current) return;

    function checkScrollable() {
      if (elementRef.current) {
        setIsScrollable(
          elementRef.current.scrollHeight > elementRef.current.clientHeight,
        );
      }
    }

    // Set up ResizeObserver to monitor size changes
    const resizeObserver = new ResizeObserver(() => {
      checkScrollable();
    });

    // Set up MutationObserver to monitor content changes
    const mutationObserver = new MutationObserver(() => {
      checkScrollable();
    });

    // Start observing
    resizeObserver.observe(elementRef.current);
    mutationObserver.observe(elementRef.current, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
    });

    // Initial check
    checkScrollable();

    // Cleanup
    return () => {
      resizeObserver.disconnect();
      mutationObserver.disconnect();
    };
  }, []);

  return { ref: elementRef, isScrollable };
}

export async function setSectionToHaveAspectRatioAndMinSize(
  sectionId,
  imgSize,
) {
  const sectionType = getSectionType(sectionId).type;
  const minHeight = getMinSectionHeight({ sectionType });
  const minWidth = getMinSectionWidth({ sectionType });
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

export function useImgArtifactAreaSize(sectionId, base64String) {
  const [imgSize, setImgSize] = useState(null);

  const widthOrHeightIsAuto = useSectionInfos((x) => {
    const { width, height } = x.x[sectionId].size;
    return width === "auto" || height === "auto";
  });

  useEffect(() => {
    async function fn() {
      const x = await getImageDimensionsFromBase64(base64String);
      if (!_.isEqual(x, imgSize)) {
        setSectionToHaveAspectRatioAndMinSize(sectionId, x);
      }
      setImgSize(x);
    }
    fn();
  }, [base64String]);

  useEffect(() => {
    if (imgSize) {
      setSectionToHaveAspectRatioAndMinSize(sectionId, imgSize);
    }
  }, [widthOrHeightIsAuto]);

  return imgSize !== null;
}

export function setDrawAreaSectionSize({ sectionId, imgSize, isNewImg }) {
  let canvasSize = {};
  const extraHeight = 120;
  const extraWidth = 24;

  const { width, height } = useSectionInfos.getState().x[sectionId].size;
  if (imgSize) {
    if (width === "auto" || height === "auto" || isNewImg) {
      const sectionType = C.DRAW;
      const minHeight = getMinSectionHeight({ sectionType });
      const minWidth = getMinSectionWidth({ sectionType });
      canvasSize = adjustSizeToBeAtLeastMin(
        imgSize.height,
        imgSize.width,
        minHeight - extraHeight,
        minWidth - extraWidth,
      );
      setSectionSize(sectionId, {
        width: canvasSize.width + extraWidth,
        height: canvasSize.height + extraHeight,
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

export function useYouTubeSectionSize(sectionId) {
  const extraHeight = 24;
  const defaultSize = { width: 640, height: 360 };
  const { width, height } = useSectionInfos(
    (x) => x.x[sectionId].size,
    _.isEqual,
  );

  function setToDefaultSize() {
    defaultSize.height += extraHeight;
    setSectionSize(sectionId, defaultSize);
    setAspectRatioInfo({
      sectionId,
      aspectRatio: 16 / 9,
      aspectRatioExtraHeight: extraHeight,
    });
  }

  useEffect(() => {
    if (width === "auto" || height === "auto") {
      setToDefaultSize();
    }
  }, [width, height]);

  useEffect(() => {
    setSectionToHaveAspectRatioAndMinSize(sectionId, defaultSize);
  }, []);

  const playerSize =
    width === "auto" || height === "auto"
      ? {}
      : { width, height: height - extraHeight };

  return playerSize;
}

export function useTwitterSectionSize(sectionId) {
  useEffect(() => {
    setSectionSize(sectionId, { height: "auto" });
    setAspectRatioInfo({
      sectionId,
      aspectRatio: null,
      aspectRatioExtraHeight: null,
      aspectRatioExtraWidth: null,
    });
  }, []);
}
