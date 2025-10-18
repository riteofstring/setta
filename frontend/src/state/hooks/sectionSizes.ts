import { SIZE_MODE } from "components/Utils/Resizable/utils";
import _ from "lodash";
import { useEffect, useRef, useState } from "react";
import {
  getCurrEffectiveSectionImpl,
  getSectionType,
} from "state/actions/sectionInfos";
import {
  adjustAspectRatio,
  adjustSizeToBeAtLeastMin,
  setSectionSize,
} from "state/actions/sections/sectionSizes";
import { useProjectState, ZustandProjectState } from "state/definitions";
import { SectionSize, SectionTypeEnum } from "utils/generatedTypes";
import { getIsTwitterSection } from "./social";

export const INFINITE_MAX_HEIGHT = 100000;
const INFINITE_MAX_WIDTH = 100000;
export const PINNED_PARAMS_AREA_MIN_HEIGHT = 64;
const ROOT_SECTION_HEIGHT = 50;
const MINIMIZE_SECTION_HEIGHT = 32;

function getMinSectionHeight({
  sectionType,
  hideSearch,
  hideParams,
  isMinimized,
}) {
  if (isMinimized) {
    return MINIMIZE_SECTION_HEIGHT;
  }

  if (sectionType === SectionTypeEnum.Callable) {
    if (hideSearch) {
      return 78;
    } else if (hideParams) {
      return 58;
    } else {
      return 104;
    }
  } else if (
    sectionType === SectionTypeEnum.ListRoot ||
    sectionType === SectionTypeEnum.DictRoot
  ) {
    return ROOT_SECTION_HEIGHT;
  } else if (sectionType === SectionTypeEnum.GlobalVariables) {
    return 78;
  } else if (sectionType === SectionTypeEnum.Code) {
    return 58.2;
  } else if (sectionType === SectionTypeEnum.TextBlock) {
    return 98;
  } else if (sectionType === SectionTypeEnum.Terminal) {
    return 100;
  } else if (
    sectionType === SectionTypeEnum.Draw ||
    sectionType === SectionTypeEnum.Image
  ) {
    return 100;
  } else if (sectionType === SectionTypeEnum.Chart) {
    return 300;
  } else if (sectionType === SectionTypeEnum.Social) {
    return 50;
  } else if (sectionType === SectionTypeEnum.Chat) {
    return 200;
  } else if (sectionType === SectionTypeEnum.Browser) {
    return 250;
  }
}

function getMaxSectionHeight({ sectionType, isMinimized }) {
  if (isMinimized) {
    return MINIMIZE_SECTION_HEIGHT;
  }
  if (
    sectionType === SectionTypeEnum.ListRoot ||
    sectionType === SectionTypeEnum.DictRoot
  ) {
    return ROOT_SECTION_HEIGHT;
  }
  return INFINITE_MAX_HEIGHT;
}

function getMinSectionWidth({ sectionType, isTwitter }) {
  if (isTwitter) {
    return 370;
  }
  if (sectionType === SectionTypeEnum.Draw) {
    return 402;
  } else if (sectionType === SectionTypeEnum.Chart) {
    return 300;
  } else if (sectionType === SectionTypeEnum.Chat) {
    return 400;
  }

  return 200;
}

function getMaxSectionWidth({ isTwitter }) {
  if (isTwitter) {
    return 574;
  }
  return INFINITE_MAX_WIDTH;
}

function getSizeMode({ sectionType, hideParams, isTwitter }) {
  if (sectionType === SectionTypeEnum.Callable) {
    if (hideParams) {
      return { height: SIZE_MODE.auto_only, width: SIZE_MODE.any };
    }
  } else if (
    sectionType === SectionTypeEnum.Terminal ||
    sectionType === SectionTypeEnum.Chart
  ) {
    return { height: SIZE_MODE.manual_only, width: SIZE_MODE.manual_only };
  }
  if (isTwitter) {
    return { height: SIZE_MODE.auto_only, width: SIZE_MODE.any };
  }
  return { height: SIZE_MODE.any, width: SIZE_MODE.any };
}

export function useSectionMinMaxDims(sectionId) {
  return useProjectState((x) => {
    const isTwitter = getIsTwitterSection(sectionId, x);
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    const sectionType = impl.type;
    const hideSearch = impl.hideSearch;
    const hideParams = impl.hideParams;
    const isMinimized = impl.isMinimized;

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
  }, _.isEqual);
}

export function useIsScrollable() {
  const [isScrollableVertical, setIsScrollableVertical] = useState(false);
  const [isScrollableHorizontal, setIsScrollableHorizontal] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!elementRef.current) return;

    function checkScrollable() {
      if (elementRef.current) {
        setIsScrollableVertical(
          elementRef.current.scrollHeight > elementRef.current.clientHeight,
        );
        setIsScrollableHorizontal(
          elementRef.current.scrollWidth > elementRef.current.clientWidth,
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

  return {
    ref: elementRef,
    isScrollable: isScrollableVertical || isScrollableHorizontal,
  };
}

async function setSectionToHaveAspectRatioAndMinSize(sectionId, imgSize) {
  const sectionType = getSectionType(sectionId);
  const minHeight = getMinSectionHeight({ sectionType });
  const minWidth = getMinSectionWidth({ sectionType });
  const currSize = useProjectState.getState().sections[sectionId].size;

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
  useProjectState.setState((state) => {
    setAspectRatioInfo({
      sectionId,
      aspectRatio: imgSize.width / imgSize.height,
      aspectRatioExtraHeight: extraHeight,
      size: adjustedSize,
      state,
    });
  });
}

export function useImgArtifactAreaSize(sectionId, image) {
  const [imgSize, setImgSize] = useState(null);

  const widthOrHeightIsAuto = useProjectState((x) => {
    const { width, height } = x.sections[sectionId].size;
    return width === "auto" || height === "auto";
  });

  useEffect(() => {
    const x = { width: image.width, height: image.height };
    if (!_.isEqual(x, imgSize)) {
      setSectionToHaveAspectRatioAndMinSize(sectionId, x);
    }
    setImgSize(x);
  }, [image.src]);

  useEffect(() => {
    if (imgSize) {
      setSectionToHaveAspectRatioAndMinSize(sectionId, imgSize);
    }
  }, [widthOrHeightIsAuto]);

  return imgSize !== null;
}

export function setDrawAreaSectionSize(
  sectionId: string,
  sectionSize: SectionSize,
  state: ZustandProjectState,
) {
  let canvasSize = { height: 0, width: 0 };
  const extraHeight = 120;
  const extraWidth = 24;
  const { width: sWidth, height: sHeight } = sectionSize;

  // if (imgSize) {
  //   if (sectionWidth === "auto" || sectionHeight === "auto" || isNewImg) {
  //     const sectionType = SectionTypeEnum.Draw;
  //     const minHeight = getMinSectionHeight({ sectionType });
  //     const minWidth = getMinSectionWidth({ sectionType });
  //     canvasSize = adjustSizeToBeAtLeastMin(
  //       imgSize.height,
  //       imgSize.width,
  //       minHeight - extraHeight,
  //       minWidth - extraWidth,
  //     );
  //     setSectionSize(
  //       sectionId,
  //       {
  //         width: canvasSize.width + extraWidth,
  //         height: canvasSize.height + extraHeight,
  //       },
  //       state,
  //     );
  //   } else {
  //     canvasSize.width = sectionWidth - extraWidth;
  //     canvasSize.height = sectionHeight - extraHeight;
  //   }

  //   if (isNewImg) {
  //     setAspectRatioInfo({
  //       sectionId,
  //       aspectRatio: imgSize.width / imgSize.height,
  //       aspectRatioExtraHeight: extraHeight,
  //       aspectRatioExtraWidth: extraWidth,
  //       state,
  //     });
  //   }
  // } else {
  const [defaultWidth, defaultHeight] = [500, 500];
  canvasSize.width = sWidth === "auto" ? defaultWidth : sWidth - extraWidth;
  canvasSize.height =
    sHeight === "auto" ? defaultHeight : sHeight - extraHeight;
  if (sWidth === "auto" || sHeight === "auto") {
    setSectionSize(
      sectionId,
      {
        width: canvasSize.width + extraWidth,
        height: canvasSize.height + extraHeight,
      },
      state,
    );
  }
  // }

  return canvasSize;
}

export function useYouTubeSectionSize(sectionId: string) {
  const extraHeight = 22;
  const defaultSize = { width: 640, height: 360 };
  const { width, height } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    return impl.size;
  }, _.isEqual);

  function setToDefaultSize() {
    defaultSize.height += extraHeight;
    useProjectState.setState((state) => {
      setAspectRatioInfo({
        sectionId,
        aspectRatio: 16 / 9,
        aspectRatioExtraHeight: extraHeight,
        size: defaultSize,
        state,
      });
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
    useProjectState.setState((state) => {
      setAspectRatioInfo({
        sectionId,
        aspectRatio: null,
        aspectRatioExtraHeight: null,
        aspectRatioExtraWidth: null,
        size: { height: "auto" },
        state,
      });
    });
  }, []);
}

function setAspectRatioInfo({
  sectionId,
  size,
  aspectRatio,
  aspectRatioExtraHeight,
  aspectRatioExtraWidth,
  state,
}) {
  const s = state.sections[sectionId];
  s.aspectRatio = aspectRatio;
  s.aspectRatioExtraHeight = aspectRatioExtraHeight;
  s.aspectRatioExtraWidth = aspectRatioExtraWidth;
  if (size) {
    setSectionSize(sectionId, size, state);
  }
}
