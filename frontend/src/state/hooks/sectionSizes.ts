import _ from "lodash";
import { useEffect, useRef, useState } from "react";
import {
  getCurrEffectiveCodeObjImplIfPresent,
  getCurrEffectiveSectionImpl,
  getCurrSectionVariantId,
  getSectionType,
  setCurrEffectiveSectionImplValue,
} from "state/actions/sectionInfos";
import { SIZE_MODE } from "state/actions/sections/sectionResizePolicy";
import {
  adjustAspectRatio,
  adjustSizeToBeAtLeastMin,
  setSectionSize,
} from "state/actions/sections/sectionSizes";
import {
  useProjectState,
  useResizeEvent,
  useSettings,
  useTemporaryMiscState,
  ZustandProjectState,
} from "state/definitions";
import {
  getKwargsControlsHeightKey,
  getParamsFixedHeightKey,
  getSectionHeaderHeightKey,
  getSectionSearchHeightKey,
} from "utils/constants";
import {
  isBaseSectionWithParamsImpl,
  MetaControlSizingPolicyTypeEntry,
  SectionSize,
  SectionSizingPolicy,
  SectionType,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { getIsTwitterSection } from "./social";

type SizeMode = {
  height: (typeof SIZE_MODE)[keyof typeof SIZE_MODE];
  width: (typeof SIZE_MODE)[keyof typeof SIZE_MODE];
};

type EffectiveSectionImpl = ReturnType<typeof getCurrEffectiveSectionImpl>;

type SectionMeasuredHeights = {
  kwargsControlsHeight: number;
  paramsFixedHeight: number;
  sectionHeaderHeight: number;
  sectionSearchHeight: number;
};

type SectionMinDimensions = {
  metaControlSizeMode: SizeMode | null;
  minHeight: number;
  minWidth: number;
};

type ResolveSectionMinMaxDimsInput = {
  sectionId: string;
  projectState: ZustandProjectState;
  sizingPolicy: SectionSizingPolicy;
  resizeEvent: string | undefined;
  measuredHeights: SectionMeasuredHeights;
};

const DEFAULT_UNPINNED_PARAMS_AREA_MIN_HEIGHT = 36;
const LEGACY_UNPINNED_PARAMS_AREA_MIN_HEIGHT = 38;
const UNPINNED_PARAMS_AREA_MIN_HEIGHT_WITH_PINNED = 36;
// Accounts for the fixed top + bottom gutters in the section grid.
const SECTION_GRID_GUTTER_HEIGHT = 8;

function getMetaControlSizingPolicyEntry({
  projectState,
  sectionId,
  controlParamId,
  sizingPolicy,
}: {
  projectState: ZustandProjectState;
  sectionId: string;
  controlParamId: string | null | undefined;
  sizingPolicy: SectionSizingPolicy;
}): MetaControlSizingPolicyTypeEntry | null {
  if (!controlParamId) {
    return null;
  }

  const controlImpl = getCurrEffectiveCodeObjImplIfPresent(
    projectState,
    sectionId,
    controlParamId,
  );
  if (!controlImpl) {
    return null;
  }
  const policyByType = sizingPolicy.metaControlByType;
  const entry = policyByType[controlImpl.type as keyof typeof policyByType];
  return entry ?? null;
}

function resolveMetaControlSizeMode(
  entry: MetaControlSizingPolicyTypeEntry | null,
): SizeMode | null {
  if (!entry) {
    return null;
  }
  const heightMode = entry.sizeModeHeight;
  const widthMode = entry.sizeModeWidth;
  if (!heightMode && !widthMode) {
    return null;
  }
  return {
    height: heightMode ?? SIZE_MODE.any,
    width: widthMode ?? SIZE_MODE.any,
  };
}

export function getMinSectionHeight({
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

export function getMaxSectionHeight({
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

export function getMinSectionWidth({
  sectionType,
  sizingPolicy,
}: {
  sectionType: SectionType;
  sizingPolicy: SectionSizingPolicy;
}): number {
  const policyByType = sizingPolicy.byType[sectionType];

  return policyByType.minWidth;
}

export function getMaxSectionWidth({
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

function hasPinnedNonEdgeParams(
  shown: ZustandProjectState["shownParamIds"][string] | undefined,
  edgeInputParams: string[],
) {
  if (!shown) {
    return false;
  }
  const edgeInputSet = new Set(edgeInputParams);
  return (shown.pinned?.topLevelParamIds ?? []).some(
    (paramId) => !edgeInputSet.has(paramId),
  );
}

function getResolvedUnpinnedMinHeight({
  hasPinnedParams,
  hideUnpinnedParams,
  sizingPolicy,
}: {
  hasPinnedParams: boolean;
  hideUnpinnedParams: boolean;
  sizingPolicy: SectionSizingPolicy;
}) {
  if (hideUnpinnedParams) {
    return 0;
  }

  const baseUnpinnedMinHeight = Number.isFinite(
    sizingPolicy.globals.unpinnedParamsAreaMinHeight,
  )
    ? sizingPolicy.globals.unpinnedParamsAreaMinHeight
    : DEFAULT_UNPINNED_PARAMS_AREA_MIN_HEIGHT;
  const normalizedUnpinnedMinHeight =
    baseUnpinnedMinHeight === LEGACY_UNPINNED_PARAMS_AREA_MIN_HEIGHT
      ? DEFAULT_UNPINNED_PARAMS_AREA_MIN_HEIGHT
      : baseUnpinnedMinHeight;

  if (
    hasPinnedParams &&
    normalizedUnpinnedMinHeight === DEFAULT_UNPINNED_PARAMS_AREA_MIN_HEIGHT
  ) {
    return UNPINNED_PARAMS_AREA_MIN_HEIGHT_WITH_PINNED;
  }

  return normalizedUnpinnedMinHeight;
}

function getRequiredParamsMinHeight({
  hideParams,
  impl,
  isMinimized,
  measuredHeights,
  projectState,
  sectionId,
  sizingPolicy,
}: {
  hideParams: boolean;
  impl: EffectiveSectionImpl;
  isMinimized: boolean;
  measuredHeights: SectionMeasuredHeights;
  projectState: ZustandProjectState;
  sectionId: string;
  sizingPolicy: SectionSizingPolicy;
}) {
  const paramsImpl = impl as EffectiveSectionImpl & {
    edgeInputParams?: string[] | null;
    hideUnpinnedParams?: boolean;
  };
  if (
    isMinimized ||
    hideParams ||
    !isBaseSectionWithParamsImpl(
      impl as unknown as Parameters<typeof isBaseSectionWithParamsImpl>[0],
    )
  ) {
    return 0;
  }

  const variantId = getCurrSectionVariantId(projectState, sectionId, true);
  const shown = projectState.shownParamIds[variantId];
  const fixedTopHeight =
    measuredHeights.sectionHeaderHeight +
    measuredHeights.sectionSearchHeight +
    measuredHeights.kwargsControlsHeight +
    SECTION_GRID_GUTTER_HEIGHT;

  return (
    fixedTopHeight +
    measuredHeights.paramsFixedHeight +
    getResolvedUnpinnedMinHeight({
      hasPinnedParams: hasPinnedNonEdgeParams(
        shown,
        paramsImpl.edgeInputParams ?? [],
      ),
      hideUnpinnedParams: Boolean(paramsImpl.hideUnpinnedParams),
      sizingPolicy,
    })
  );
}

function getMetaControlMinDimensions({
  controlParamId,
  minHeight,
  minWidth,
  projectState,
  sectionId,
  sectionType,
  sizingPolicy,
}: {
  controlParamId: string | null | undefined;
  minHeight: number;
  minWidth: number;
  projectState: ZustandProjectState;
  sectionId: string;
  sectionType: SectionType;
  sizingPolicy: SectionSizingPolicy;
}): SectionMinDimensions {
  if (sectionType !== SectionTypeEnum.MetaControl) {
    return { minHeight, minWidth, metaControlSizeMode: null };
  }

  const metaControlEntry = getMetaControlSizingPolicyEntry({
    projectState,
    sectionId,
    controlParamId,
    sizingPolicy,
  });
  return {
    minHeight: metaControlEntry
      ? Math.max(minHeight, metaControlEntry.minHeight)
      : minHeight,
    minWidth: metaControlEntry
      ? Math.max(minWidth, metaControlEntry.minWidth)
      : minWidth,
    metaControlSizeMode: resolveMetaControlSizeMode(metaControlEntry),
  };
}

function getSectionMinDimensions({
  hideParams,
  hideSearch,
  impl,
  isMinimized,
  measuredHeights,
  projectState,
  sectionId,
  sectionType,
  sizingPolicy,
}: {
  hideParams: boolean;
  hideSearch: boolean;
  impl: EffectiveSectionImpl;
  isMinimized: boolean;
  measuredHeights: SectionMeasuredHeights;
  projectState: ZustandProjectState;
  sectionId: string;
  sectionType: SectionType;
  sizingPolicy: SectionSizingPolicy;
}): SectionMinDimensions {
  const minHeight = Math.max(
    getMinSectionHeight({
      sectionType,
      hideSearch,
      hideParams,
      isMinimized,
      sizingPolicy,
    }),
    getRequiredParamsMinHeight({
      hideParams,
      impl,
      isMinimized,
      measuredHeights,
      projectState,
      sectionId,
      sizingPolicy,
    }),
  );
  const minWidth = getMinSectionWidth({
    sectionType,
    sizingPolicy,
  });

  return getMetaControlMinDimensions({
    controlParamId:
      sectionType === SectionTypeEnum.MetaControl
        ? impl.metaControlParamId
        : null,
    minHeight,
    minWidth,
    projectState,
    sectionId,
    sectionType,
    sizingPolicy,
  });
}

export function resolveSectionMinMaxDims({
  sectionId,
  projectState,
  sizingPolicy,
  resizeEvent,
  measuredHeights,
}: ResolveSectionMinMaxDimsInput) {
  const isTwitter = getIsTwitterSection(sectionId, projectState);
  const impl = getCurrEffectiveSectionImpl(projectState, sectionId);
  const sectionType = impl.type as SectionType;
  const hideSearch = impl.hideSearch;
  const hideParams = impl.hideParams;
  const isMinimized = impl.isMinimized;
  const policyMaxHeight = getMaxSectionHeight({
    sectionType,
    isMinimized,
    sizingPolicy,
  });
  const isAutoHeight = impl.size.height === "auto";
  const isResizing = resizeEvent === "start";
  const autoMaxHeight = sizingPolicy.globals.autoMaxHeight;

  const maxWidth = getMaxSectionWidth({
    sectionType,
    sizingPolicy,
  });
  const { minHeight, minWidth, metaControlSizeMode } = getSectionMinDimensions({
    hideParams,
    hideSearch,
    impl,
    isMinimized,
    measuredHeights,
    projectState,
    sectionId,
    sectionType,
    sizingPolicy,
  });

  const cappedAutoMaxHeight = Math.min(policyMaxHeight, autoMaxHeight);
  const maxHeight =
    isAutoHeight && !isResizing
      ? Math.max(minHeight, cappedAutoMaxHeight)
      : Math.max(minHeight, policyMaxHeight);

  const sizeMode = getSizeMode({
    sectionType,
    hideParams,
    isTwitter,
    metaControlSizeMode,
  });

  return { minHeight, maxHeight, minWidth, maxWidth, sizeMode };
}

function getTemporaryMeasuredHeight(key: string): number {
  const height = useTemporaryMiscState.getState()[key];
  return typeof height === "number" ? height : 0;
}

export function getSectionMinMaxDims(sectionId: string) {
  return resolveSectionMinMaxDims({
    sectionId,
    projectState: useProjectState.getState(),
    sizingPolicy: useSettings.getState().sectionSizingPolicy,
    resizeEvent: useResizeEvent.getState().resizeEvent[sectionId],
    measuredHeights: {
      kwargsControlsHeight: getTemporaryMeasuredHeight(
        getKwargsControlsHeightKey(sectionId),
      ),
      paramsFixedHeight: getTemporaryMeasuredHeight(
        getParamsFixedHeightKey(sectionId),
      ),
      sectionHeaderHeight: getTemporaryMeasuredHeight(
        getSectionHeaderHeightKey(sectionId),
      ),
      sectionSearchHeight: getTemporaryMeasuredHeight(
        getSectionSearchHeightKey(sectionId),
      ),
    },
  });
}

export function useSectionMinMaxDims(sectionId: string) {
  const sizingPolicy = useSettings((x) => x.sectionSizingPolicy, _.isEqual);
  const resizeEvent = useResizeEvent((x) => x.resizeEvent[sectionId]);
  const sectionHeaderHeight = useTemporaryMiscState((x) => {
    const height = x[getSectionHeaderHeightKey(sectionId)];
    return typeof height === "number" ? height : 0;
  });
  const sectionSearchHeight = useTemporaryMiscState((x) => {
    const height = x[getSectionSearchHeightKey(sectionId)];
    return typeof height === "number" ? height : 0;
  });
  const kwargsControlsHeight = useTemporaryMiscState((x) => {
    const height = x[getKwargsControlsHeightKey(sectionId)];
    return typeof height === "number" ? height : 0;
  });
  const paramsFixedHeight = useTemporaryMiscState((x) => {
    const height = x[getParamsFixedHeightKey(sectionId)];
    return typeof height === "number" ? height : 0;
  });
  return useProjectState(
    (projectState) =>
      resolveSectionMinMaxDims({
        sectionId,
        projectState,
        sizingPolicy,
        resizeEvent,
        measuredHeights: {
          kwargsControlsHeight,
          paramsFixedHeight,
          sectionHeaderHeight,
          sectionSearchHeight,
        },
      }),
    _.isEqual,
  );
}

type UseIsScrollableOptions = {
  onMeasure?: (element: HTMLDivElement) => void;
};

export function useIsScrollable(options: UseIsScrollableOptions = {}) {
  const [isScrollableVertical, setIsScrollableVertical] = useState(false);
  const [isScrollableHorizontal, setIsScrollableHorizontal] = useState(false);
  const elementRef = useRef<HTMLDivElement>(null);
  const onMeasureRef = useRef<UseIsScrollableOptions["onMeasure"]>(null);

  useEffect(() => {
    onMeasureRef.current = options.onMeasure ?? null;
  }, [options.onMeasure]);

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
        onMeasureRef.current?.(elementRef.current);
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
  const projectState = useProjectState.getState();
  const sectionType = getSectionType(projectState, sectionId) as SectionType;
  const sizingPolicy = useSettings.getState().sectionSizingPolicy;
  const minHeight = getMinSectionHeight({ sectionType, sizingPolicy });
  const minWidth = getMinSectionWidth({
    sectionType,
    sizingPolicy,
  });
  const currSize = getCurrEffectiveSectionImpl(projectState, sectionId).size;

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
      aspectRatioExtraWidth: 0,
      size: adjustedSize,
      state,
    });
  });
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
        aspectRatioExtraWidth: 0,
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
        aspectRatioExtraHeight: 0,
        aspectRatioExtraWidth: 0,
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
  aspectRatioExtraWidth = 0,
  state,
}: {
  sectionId: string;
  size?: Partial<SectionSize> | null | undefined;
  aspectRatio: number | null;
  aspectRatioExtraHeight: number;
  aspectRatioExtraWidth?: number | undefined;
  state: ZustandProjectState;
}) {
  setCurrEffectiveSectionImplValue(state, sectionId, {
    aspectRatio,
    aspectRatioExtraHeight,
    aspectRatioExtraWidth,
  } as unknown as Parameters<typeof setCurrEffectiveSectionImplValue>[2]);
  if (size) {
    setSectionSize(sectionId, size, state);
  }
}
