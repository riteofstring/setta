import { SIZE_MODE } from "components/Utils/Resizable/utils";
import _ from "lodash";
import { useEffect, useRef, useState } from "react";
import {
  getCurrEffectiveCodeObjImpl,
  getCurrEffectiveSectionImpl,
  getCurrShownParamIds,
  getSectionType,
} from "state/actions/sectionInfos";
import {
  adjustAspectRatio,
  adjustSizeToBeAtLeastMin,
  setSectionSize,
} from "state/actions/sections/sectionSizes";
import {
  useProjectState,
  useSettings,
  useTemporaryMiscState,
  ZustandProjectState,
} from "state/definitions";
import {
  getEdgesStripHeightKey,
  getKwargsControlsHeightKey,
  getParamGroupPaddingKey,
  getPinnedParamsMinHeightKey,
  getUnpinnedParamsMinHeightKey,
} from "utils/constants";
import {
  CodeObjTypeEnum,
  isBaseSectionWithParamsImpl,
  SectionSize,
  SectionSizingPolicy,
  SectionType,
  SectionTypeEnum,
  SectionWithParamsDisplayModeEnum,
} from "utils/generatedTypes";
import { getIsTwitterSection } from "./social";

type SizeMode = {
  height: (typeof SIZE_MODE)[keyof typeof SIZE_MODE];
  width: (typeof SIZE_MODE)[keyof typeof SIZE_MODE];
};

const DEFAULT_UNPINNED_PARAMS_AREA_MIN_HEIGHT = 38;

function getMetaControlSizeMode({
  projectState,
  sectionId,
  controlParamId,
}: {
  projectState: ZustandProjectState;
  sectionId: string;
  controlParamId: string | null | undefined;
}): SizeMode | null {
  if (!controlParamId) {
    return null;
  }

  const controlImpl = getCurrEffectiveCodeObjImpl(
    projectState,
    sectionId,
    controlParamId,
  );

  if (
    controlImpl.type === CodeObjTypeEnum.DropdownParam ||
    controlImpl.type === CodeObjTypeEnum.SliderParam ||
    controlImpl.type === CodeObjTypeEnum.PasswordParam
  ) {
    return { height: SIZE_MODE.auto_only, width: SIZE_MODE.any };
  }

  return null;
}

function getMetaControlMinHeight({
  projectState,
  sectionId,
  controlParamId,
}: {
  projectState: ZustandProjectState;
  sectionId: string;
  controlParamId: string | null | undefined;
}): number | null {
  if (!controlParamId) {
    return null;
  }

  const controlImpl = getCurrEffectiveCodeObjImpl(
    projectState,
    sectionId,
    controlParamId,
  );

  if (controlImpl.type === CodeObjTypeEnum.ButtonParam) {
    return 32;
  }

  return null;
}

function getMinSectionHeight({
  sectionType,
  hideSearch,
  hideParams,
  isMinimized,
  sizingPolicy,
}: {
  sectionType: SectionType;
  hideSearch?: boolean;
  hideParams?: boolean;
  isMinimized?: boolean;
  sizingPolicy: SectionSizingPolicy;
}): number {
  const policyByType = sizingPolicy.byType[sectionType];

  if (isMinimized) {
    return sizingPolicy.globals.minimizedHeight;
  }

  if (sectionType === SectionTypeEnum.Callable) {
    const callablePolicy = sizingPolicy.byType.Callable;
    if (hideSearch) {
      return callablePolicy.hideSearchMinHeight;
    }
    if (hideParams) {
      return callablePolicy.hideParamsMinHeight;
    }
  }

  return policyByType.minHeight;
}

function getMaxSectionHeight({
  sectionType,
  isMinimized,
  sizingPolicy,
}: {
  sectionType: SectionType;
  isMinimized?: boolean;
  sizingPolicy: SectionSizingPolicy;
}): number {
  const policyByType = sizingPolicy.byType[sectionType];

  if (isMinimized) {
    return sizingPolicy.globals.minimizedHeight;
  }

  return policyByType.maxHeight;
}

function getMinSectionWidth({
  sectionType,
  sizingPolicy,
}: {
  sectionType: SectionType;
  sizingPolicy: SectionSizingPolicy;
}): number {
  const policyByType = sizingPolicy.byType[sectionType];

  return policyByType.minWidth;
}

function getMaxSectionWidth({
  sectionType,
  sizingPolicy,
}: {
  sectionType: SectionType;
  sizingPolicy: SectionSizingPolicy;
}): number {
  const policyByType = sizingPolicy.byType[sectionType];

  return policyByType.maxWidth;
}

function getSizeMode({
  sectionType,
  hideParams,
  isTwitter,
  metaControlSizeMode,
}: {
  sectionType: SectionType;
  hideParams?: boolean;
  isTwitter: boolean;
  metaControlSizeMode: SizeMode | null;
}) {
  if (sectionType === SectionTypeEnum.MetaControl && metaControlSizeMode) {
    return metaControlSizeMode;
  }

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

export function useSectionMinMaxDims(sectionId: string) {
  const sizingPolicy = useSettings((x) => x.sectionSizingPolicy, _.isEqual);
  const edgesStripHeight = useTemporaryMiscState((x) => {
    const height = x[getEdgesStripHeightKey(sectionId)];
    return typeof height === "number" ? height : 0;
  });
  const kwargsControlsHeight = useTemporaryMiscState((x) => {
    const height = x[getKwargsControlsHeightKey(sectionId)];
    return typeof height === "number" ? height : 0;
  });
  const pinnedParamsMinHeight = useTemporaryMiscState((x) => {
    const height = x[getPinnedParamsMinHeightKey(sectionId)];
    return typeof height === "number" ? height : 0;
  });
  const unpinnedParamsMinHeight = useTemporaryMiscState((x) => {
    const height = x[getUnpinnedParamsMinHeightKey(sectionId)];
    return typeof height === "number" ? height : 0;
  });
  const paramGroupPadding = useTemporaryMiscState((x) => {
    const padding = x[getParamGroupPaddingKey(sectionId)];
    return typeof padding === "number" ? padding : 0;
  });

  return useProjectState((x) => {
    const isTwitter = getIsTwitterSection(sectionId, x);
    const impl = getCurrEffectiveSectionImpl(x, sectionId);
    const sectionType = impl.type;
    const hideSearch = impl.hideSearch;
    const hideParams = impl.hideParams;
    const isMinimized = impl.isMinimized;

    let minHeight = getMinSectionHeight({
      sectionType,
      hideSearch,
      hideParams,
      isMinimized,
      sizingPolicy,
    });

    const maxHeight = getMaxSectionHeight({
      sectionType,
      isMinimized,
      sizingPolicy,
    });

    let minWidth = getMinSectionWidth({
      sectionType,
      sizingPolicy,
    });
    const maxWidth = getMaxSectionWidth({
      sectionType,
      sizingPolicy,
    });

    if (
      !isMinimized &&
      (sectionType === SectionTypeEnum.MetaControl ||
        sectionType === SectionTypeEnum.TextBlock)
    ) {
      minHeight *= 0.5;
      minWidth *= 0.5;
    }

    if (
      !isMinimized &&
      isBaseSectionWithParamsImpl(impl) &&
      impl.displayMode === SectionWithParamsDisplayModeEnum.Gui &&
      !hideParams
    ) {
      let baseMinHeight = minHeight;
      if (sectionType === SectionTypeEnum.Callable) {
        baseMinHeight = sizingPolicy.byType.Callable.hideParamsMinHeight;
      }
      const pinned = getCurrShownParamIds(x, sectionId, true, true);
      const unpinned = getCurrShownParamIds(x, sectionId, false, true);
      const edgeInputSet = new Set(impl.edgeInputParams);
      const hasPinnedParams = pinned.topLevelParamIds.some(
        (paramId) => !edgeInputSet.has(paramId),
      );
      const hasUnpinnedParams =
        !impl.hideUnpinnedParams &&
        unpinned.topLevelParamIds.some((paramId) => !edgeInputSet.has(paramId));
      const hasEdges =
        impl.edgeInputParams.length > 0 || impl.edgeOutputPorts.length > 0;
      const resolvedPinnedMinHeight =
        pinnedParamsMinHeight > 0
          ? pinnedParamsMinHeight
          : sizingPolicy.globals.pinnedParamsAreaMinHeight;
      const baseUnpinnedMinHeight = Number.isFinite(
        sizingPolicy.globals.unpinnedParamsAreaMinHeight,
      )
        ? sizingPolicy.globals.unpinnedParamsAreaMinHeight
        : DEFAULT_UNPINNED_PARAMS_AREA_MIN_HEIGHT;
      const resolvedUnpinnedMinHeight =
        unpinnedParamsMinHeight > 0
          ? unpinnedParamsMinHeight
          : baseUnpinnedMinHeight;
      let requiredParamsHeight = 0;
      if (hasPinnedParams) {
        if (typeof impl.pinnedAreaHeight === "number") {
          requiredParamsHeight += Math.max(
            impl.pinnedAreaHeight,
            resolvedPinnedMinHeight,
          );
        } else {
          requiredParamsHeight += resolvedPinnedMinHeight;
        }
      }
      if (hasUnpinnedParams) {
        requiredParamsHeight += resolvedUnpinnedMinHeight;
      }
      if (kwargsControlsHeight > 0) {
        requiredParamsHeight += kwargsControlsHeight;
      }
      if (hasEdges) {
        requiredParamsHeight += edgesStripHeight;
      }
      if (hasPinnedParams || hasUnpinnedParams || hasEdges) {
        requiredParamsHeight += paramGroupPadding;
      }
      if (requiredParamsHeight > 0) {
        minHeight = Math.max(minHeight, baseMinHeight + requiredParamsHeight);
      }
    }

    let metaControlSizeMode: SizeMode | null = null;
    if (sectionType === SectionTypeEnum.MetaControl) {
      const metaControlMinHeight = getMetaControlMinHeight({
        projectState: x,
        sectionId,
        controlParamId: impl.metaControlParamId,
      });
      if (metaControlMinHeight !== null) {
        minHeight = Math.max(minHeight, metaControlMinHeight);
      }
      metaControlSizeMode = getMetaControlSizeMode({
        projectState: x,
        sectionId,
        controlParamId: impl.metaControlParamId,
      });
    }

    const sizeMode = getSizeMode({
      sectionType,
      hideParams,
      isTwitter,
      metaControlSizeMode,
    });

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

async function setSectionToHaveAspectRatioAndMinSize(
  sectionId: string,
  imgSize: { width: number; height: number },
) {
  const sectionType = getSectionType(sectionId);
  const state = useProjectState.getState();
  const sizingPolicy = useSettings.getState().sectionSizingPolicy;
  const minHeight = getMinSectionHeight({ sectionType, sizingPolicy });
  const minWidth = getMinSectionWidth({
    sectionType,
    sizingPolicy,
  });
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

function useImgArtifactAreaSize(sectionId, image) {
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
