import _ from "lodash";

import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";

import { getCurrEffectiveSectionImplWithTypeGuard } from "state/actions/sectionInfos";

import {
  useMisc,
  useProjectState,
  useSettings,
  useTemporaryMiscState,
} from "state/definitions";

import { useIsScrollable } from "state/hooks/sectionSizes";

import { useShareCapabilities } from "state/hooks/share";

import {
  getEdgesStripHeightKey,
  getPinnedParamsAreaHeightKey,
  getUnpinnedParamsAreaHeightKey,
} from "utils/constants";

import {
  isBaseSectionWithParamsImpl,
  SectionTypeEnum,
} from "utils/generatedTypes";

import { resolveEdgeStripHeight } from "../edgeStripUtils";

import { ParamDndList } from "../ParamDndList";

import {
  EdgeInputPortRow,
  EdgeOutputPortRow,
  filterShownParamIds,
  getEdgeStripAppearance,
  getPinnedParamsBgClassName,
  resolveUnpinnedParamsAreaMinHeight,
  selectEdgeStripState,
  selectUnpinnedParamsState,
  shouldApplyUnpinnedAreaMinHeight,
  useHasSectionStyleTheme,
  useMeasuredParamAreaMinHeight,
} from "./groupContainer";

export function EdgesStrip({
  sectionId,
  bgColor,
}: {
  sectionId: string;
  bgColor: string;
}) {
  const { canEditStructure } = useShareCapabilities();
  const isSelectingParams = useMisc((x) => x.isSelectingParams);
  const lastHeightRef = useRef(0);
  const stripRef = useRef<HTMLElement | null>(null);
  const [measuredHeight, setMeasuredHeight] = useState<number | null>(null);
  const heightKey = getEdgesStripHeightKey(sectionId);
  const {
    inputPorts,
    outputPorts,
    shouldRoundBottom,
    positionAndSizeLocked,
    selectedParams,
    styleColor,
  } = useProjectState(
    (state) => selectEdgeStripState(state, sectionId),
    _.isEqual,
  );
  const hasSectionStyleTheme = useHasSectionStyleTheme(sectionId, styleColor);

  const hasEdges = inputPorts.length > 0 || outputPorts.length > 0;
  const selectedParamIdSet = new Set(selectedParams);
  const canConnect = canEditStructure && !isSelectingParams;
  const appearance = getEdgeStripAppearance({
    hasSectionStyleTheme,
    bgColor,
    isSelectingParams,
    shouldRoundBottom,
    positionAndSizeLocked,
  });

  useLayoutEffect(() => {
    if (!hasEdges) {
      setMeasuredHeight(null);
      return;
    }
    const element = stripRef.current;
    if (!element) {
      setMeasuredHeight(null);
      return;
    }
    let frameId = 0;

    const updateMeasuredHeight = () => {
      const nextHeight = Math.ceil(element.scrollHeight);
      setMeasuredHeight((prev) => (prev === nextHeight ? prev : nextHeight));
    };

    const scheduleMeasure = () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(updateMeasuredHeight);
    };

    const resizeObserver = new ResizeObserver(scheduleMeasure);
    resizeObserver.observe(element);
    scheduleMeasure();

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      resizeObserver.disconnect();
    };
  }, [hasEdges, inputPorts.length, outputPorts.length]);

  useEffect(() => {
    if (!hasEdges) {
      if (lastHeightRef.current !== 0) {
        lastHeightRef.current = 0;
        useTemporaryMiscState.setState({ [heightKey]: 0 });
      }
      return;
    }
    const nextHeight = resolveEdgeStripHeight({
      measuredHeight,
      inputPortCount: inputPorts.length,
      outputPortCount: outputPorts.length,
    });
    if (nextHeight === lastHeightRef.current) {
      return;
    }
    lastHeightRef.current = nextHeight;
    useTemporaryMiscState.setState({ [heightKey]: nextHeight });
  }, [
    hasEdges,
    heightKey,
    inputPorts.length,
    measuredHeight,
    outputPorts.length,
  ]);

  useEffect(() => {
    return () => {
      if (lastHeightRef.current !== 0) {
        lastHeightRef.current = 0;
        useTemporaryMiscState.setState({ [heightKey]: 0 });
      }
    };
  }, [heightKey]);

  if (!hasEdges) {
    return null;
  }

  return (
    <section
      className={`section-w-full section-row-pin-main relative z-0 -mt-4 flex shrink-0 flex-col overflow-visible border-b pt-5 ${appearance.stripBorderColorClassName} ${appearance.edgeStripBgColorClassName} ${appearance.roundedBottomClassName}`}
      ref={stripRef}
      data-params-fixed="true"
    >
      <div className="grid grid-cols-[minmax(0,1fr)_0.75rem_minmax(0,1fr)] py-2">
        <div className="flex flex-col pl-2">
          <div
            className={`text-[0.5rem] font-bold uppercase ${appearance.edgeLabelColorClassName}`}
          >
            In
          </div>
          <div className="-ml-2 flex flex-col gap-1 pt-1">
            {inputPorts.map((port) => (
              <EdgeInputPortRow
                key={port.id}
                port={port}
                sectionId={sectionId}
                selected={selectedParamIdSet.has(port.id)}
                isSelectingParams={isSelectingParams}
                canConnect={canConnect}
                appearance={appearance}
              />
            ))}
          </div>
        </div>
        <div
          className="pointer-events-none flex items-stretch justify-center"
          aria-hidden="true"
        >
          <div className={`h-full w-px ${appearance.dividerColorClassName}`} />
        </div>
        <div className="flex flex-col pr-2">
          <div
            className={`text-right text-[0.5rem] font-bold uppercase ${appearance.edgeLabelColorClassName}`}
          >
            Out
          </div>
          <div className="-mr-2 flex flex-col gap-1 pt-1">
            {outputPorts.map((port) => (
              <EdgeOutputPortRow
                key={port.id}
                port={port}
                canConnect={canConnect}
                appearance={appearance}
              />
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export type MaxNestedDepth = {
  pinned: number;
  unpinned: number;
};

export type GetPinnedParamsProps = {
  sectionId: string;
  handleColumnResizeStart: React.MouseEventHandler<HTMLDivElement>;
  setMaxNestedDepth: React.Dispatch<React.SetStateAction<MaxNestedDepth>>;
  sectionTypeName: SectionTypeEnum;
};

export type PinnedParamsAreaProps = {
  sectionId: string;
  topLevelParamIds: Array<string>;
  requiredParamIdsToPaths: Record<string, Array<string>>;
  handleColumnResizeStart: React.MouseEventHandler<HTMLDivElement>;
  hasSectionStyleTheme: boolean;
  shouldRoundBottom: boolean;
  positionAndSizeLocked: boolean;
  sectionTypeName: SectionTypeEnum;
  contentRef: React.RefObject<HTMLDivElement>;
  headerRef: React.RefObject<HTMLElement>;
  rowsRef: React.RefObject<HTMLDivElement>;
};

export type GetUnpinnedParamsProps = {
  sectionId: string;
  handleColumnResizeStart: React.MouseEventHandler<HTMLDivElement>;
  setMaxNestedDepth: React.Dispatch<React.SetStateAction<MaxNestedDepth>>;
};

export function GetPinnedParams({
  sectionId,
  handleColumnResizeStart,
  setMaxNestedDepth,
  sectionTypeName,
}: GetPinnedParamsProps) {
  const {
    requiredParamIdsToPaths,
    topLevelParamIds,
    shouldRoundBottom,
    positionAndSizeLocked,
    styleColor,
  } = useProjectState((x) => {
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      x,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    const filteredPinned = filterShownParamIds(
      x,
      sectionId,
      true,
      impl.edgeInputParams,
    );
    return {
      ...filteredPinned,
      shouldRoundBottom: !impl.hideUnpinnedParams,
      positionAndSizeLocked: impl.positionAndSizeLocked,
      styleColor: impl.styleColor ?? null,
    };
  }, _.isEqual);
  const hasSectionStyleTheme = useHasSectionStyleTheme(sectionId, styleColor);

  const maxNestedDepth = getLongestListLength(requiredParamIdsToPaths);
  const contentRef = useRef<HTMLDivElement | null>(null);
  const headerRef = useRef<HTMLElement | null>(null);
  const rowsRef = useRef<HTMLDivElement | null>(null);
  const heightKey = getPinnedParamsAreaHeightKey(sectionId);

  useEffect(() => {
    setMaxNestedDepth((s) => ({ ...s, pinned: maxNestedDepth }));
  }, [maxNestedDepth]);

  useMeasuredParamAreaMinHeight({
    sectionId,
    heightKey,
    paramIds: topLevelParamIds,
    contentRef,
    headerRef,
    rowsRef,
  });

  return (
    topLevelParamIds.length > 0 && (
      <PinnedParamsArea
        sectionId={sectionId}
        topLevelParamIds={topLevelParamIds}
        requiredParamIdsToPaths={requiredParamIdsToPaths}
        handleColumnResizeStart={handleColumnResizeStart}
        hasSectionStyleTheme={hasSectionStyleTheme}
        shouldRoundBottom={shouldRoundBottom}
        positionAndSizeLocked={positionAndSizeLocked}
        sectionTypeName={sectionTypeName}
        contentRef={contentRef}
        headerRef={headerRef}
        rowsRef={rowsRef}
      />
    )
  );
}

export function PinnedParamsArea({
  sectionId,
  topLevelParamIds,
  requiredParamIdsToPaths,
  handleColumnResizeStart,
  hasSectionStyleTheme,
  shouldRoundBottom,
  positionAndSizeLocked,
  sectionTypeName,
  contentRef,
  headerRef,
  rowsRef,
}: PinnedParamsAreaProps) {
  const pinnedBgClassName = hasSectionStyleTheme
    ? "bg-[color:var(--setta-section-style-panel-bg)]"
    : getPinnedParamsBgClassName(sectionTypeName);
  const pinnedBorderColorClassName = hasSectionStyleTheme
    ? "border-[color:var(--setta-section-style-border)]"
    : "border-white dark:border-setta-700/30";
  const pinnedLabelColorClassName = hasSectionStyleTheme
    ? "text-[color:var(--setta-section-style-muted-text)]"
    : "text-setta-300 dark:text-setta-500";
  const pinnedIconColorClassName = hasSectionStyleTheme
    ? "text-[color:var(--setta-section-style-muted-text)] after:text-[color:var(--setta-section-style-muted-text)]"
    : "text-setta-300 after:text-setta-300 dark:text-setta-500 dark:after:text-setta-500";
  let roundedBottomClassName = "";
  if (shouldRoundBottom) {
    roundedBottomClassName = positionAndSizeLocked
      ? "rounded-b-sm"
      : "rounded-b-xl";
  }

  return (
    <section
      className={`relative flex min-h-0 w-full shrink-0 flex-col items-start border-b shadow-sm ${pinnedBorderColorClassName} ${pinnedBgClassName} ${roundedBottomClassName}`}
      data-params-fixed="true"
    >
      <div
        className="flex min-h-0 w-full flex-1 flex-col pb-3 pt-2"
        ref={contentRef}
      >
        <header className="flex w-full gap-1 px-2" ref={headerRef}>
          <i
            className={`gg-pin-alt scale-25 ml-1 mr-[0.1rem] mt-[0.3rem] ${pinnedIconColorClassName}`}
          />
          <p
            className={`text-[0.5rem] font-bold uppercase ${pinnedLabelColorClassName}`}
          >
            Pinned Params
          </p>
        </header>

        <div
          className="section-args-nested section-key-value section-min-rows grid min-h-0 w-full flex-1 grid-cols-subgrid content-start gap-y-1 pr-1.5"
          ref={rowsRef}
        >
          <ParamDndList
            sectionId={sectionId}
            paramIds={topLevelParamIds}
            requiredParamIdsToPaths={requiredParamIdsToPaths}
            onResizeStart={handleColumnResizeStart}
            isTopLevel={true}
            listKey="pinned"
            hasSectionStyleTheme={hasSectionStyleTheme}
          />
        </div>
      </div>
    </section>
  );
}

export function GetUnpinnedParams({
  sectionId,
  handleColumnResizeStart,
  setMaxNestedDepth,
}: GetUnpinnedParamsProps) {
  const {
    hideUnpinnedParams,
    requiredParamIdsToPaths,
    topLevelParamIds,
    hasPinnedParams,
    positionAndSizeLocked,
    styleColor,
  } = useProjectState(
    (x) => selectUnpinnedParamsState(x, sectionId),
    _.isEqual,
  );
  const hasSectionStyleTheme = useHasSectionStyleTheme(sectionId, styleColor);

  const { canEditLayout } = useShareCapabilities();
  const sizingPolicy = useSettings((x) => x.sectionSizingPolicy, _.isEqual);
  const heightKey = getUnpinnedParamsAreaHeightKey(sectionId);
  const resolvedMinHeight = resolveUnpinnedParamsAreaMinHeight(
    sizingPolicy,
    hasPinnedParams,
  );
  const shouldApplyMinHeight = shouldApplyUnpinnedAreaMinHeight({
    hideUnpinnedParams,
    canEditLayout,
    positionAndSizeLocked,
  });

  const maxNestedDepth = getLongestListLength(requiredParamIdsToPaths);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const { ref: scrollRef, isScrollable } = useIsScrollable();

  const setContainerRef = useCallback(
    (node: HTMLDivElement | null) => {
      containerRef.current = node;
      scrollRef.current = node;
    },
    [scrollRef],
  );

  useEffect(() => {
    setMaxNestedDepth((s) => ({ ...s, unpinned: maxNestedDepth }));
  }, [maxNestedDepth]);

  useMeasuredParamAreaMinHeight({
    sectionId,
    heightKey,
    paramIds: hideUnpinnedParams ? [] : topLevelParamIds,
    contentRef: containerRef,
    rowsRef: containerRef,
  });

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div
        className={`section-args-nested grid min-h-0 min-w-0 !max-w-full flex-1 auto-rows-min grid-cols-subgrid content-start gap-y-1 overflow-x-clip overflow-y-scroll py-2 pr-1.5 ${
          isScrollable ? "nowheel" : ""
        }`}
        ref={setContainerRef}
        style={
          shouldApplyMinHeight ? { minHeight: resolvedMinHeight } : undefined
        }
      >
        {!hideUnpinnedParams && (
          <ParamDndList
            sectionId={sectionId}
            paramIds={topLevelParamIds}
            requiredParamIdsToPaths={requiredParamIdsToPaths}
            onResizeStart={handleColumnResizeStart}
            isTopLevel={true}
            listKey="unpinned"
            hasSectionStyleTheme={hasSectionStyleTheme}
          />
        )}
      </div>
    </div>
  );
}

export function getLongestListLength(obj: Record<string, Array<string>>) {
  return Object.values(obj).reduce(
    (max, arr) => (arr.length > max ? arr.length : max),
    0,
  );
}

export function filterEdgeInputs(
  requiredParamIdsToPaths: Record<string, Array<string>>,
  topLevelParamIds: Array<string>,
  edgeInputParams: Array<string>,
) {
  if (edgeInputParams.length === 0) {
    return { requiredParamIdsToPaths, topLevelParamIds };
  }
  const edgeInputSet = new Set(edgeInputParams);
  const filteredParamIdsToPaths: Record<string, Array<string>> = {};
  for (const [paramId, path] of Object.entries(requiredParamIdsToPaths)) {
    if (!edgeInputSet.has(paramId)) {
      filteredParamIdsToPaths[paramId] = path;
    }
  }
  const filteredTopLevel = topLevelParamIds.filter(
    (paramId) => !edgeInputSet.has(paramId),
  );
  return {
    requiredParamIdsToPaths: filteredParamIdsToPaths,
    topLevelParamIds: filteredTopLevel,
  };
}
