import { ParamDndContext } from "forks/dnd-kit/ParamDndContext";
import _ from "lodash";
import React, {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  getCurrEffectiveSectionImplWithTypeGuard,
  getCurrShownParamIds,
  getParamDisplayName,
} from "state/actions/sectionInfos";
import { paramNameFromPathArray } from "state/actions/sections/sectionContents";
import {
  useMisc,
  useProjectState,
  useSettings,
  useTemporaryMiscState,
  type ZustandProjectState,
} from "state/definitions";
import { useParametersRequestWaitingForLSPResult } from "state/hooks/lsp";
import { useShareCapabilities } from "state/hooks/share";
import { useParamColumnWidth } from "state/hooks/useParamColumnWidth";
import { C } from "utils/c";
import { getParamsFixedHeightKey } from "utils/constants";
import {
  isBaseSectionWithParamsImpl,
  SectionTypeEnum,
} from "utils/generatedTypes";
import { LiveDictAreaMount } from "./groupContainerLiveDictAreaMount";
import { buildLiveDictAreaSurface } from "./groupContainerLiveDictAreaSurface";

function _ParamGroupContainer({
  sectionId,
  bgColor,
  sectionTypeName,
}: {
  sectionId: string;
  bgColor: string;
  sectionTypeName: SectionTypeEnum;
}) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const [maxNestedDepth, setMaxNestedDepth] = useState({
    pinned: 1,
    unpinned: 1,
  });
  const paramsFixedHeightKey = getParamsFixedHeightKey(sectionId);
  const lastFixedHeightRef = useRef<number | null>(null);
  const pendingFixedHeightRef = useRef<number | null>(null);
  const waitingForResult = useParametersRequestWaitingForLSPResult(sectionId);
  const waitingForResultRef = useRef(waitingForResult);

  const handleColumnResizeStart = useParamColumnWidth({
    sectionId,
    outerRef,
    maxNestedDepth: Math.max(maxNestedDepth.pinned, maxNestedDepth.unpinned),
  });

  const setOuterRef = useCallback((node: HTMLDivElement | null) => {
    outerRef.current = node;
  }, []);

  useEffect(() => {
    waitingForResultRef.current = waitingForResult;
  }, [waitingForResult]);

  useLayoutEffect(() => {
    const outer = outerRef.current;
    if (!outer) {
      lastFixedHeightRef.current = null;
      pendingFixedHeightRef.current = null;
      useTemporaryMiscState.setState({ [paramsFixedHeightKey]: 0 });
      return;
    }
    let frameId = 0;
    const observed = new Set<HTMLElement>();
    const resizeObserver = new ResizeObserver(() => scheduleMeasure());
    const mutationObserver = new MutationObserver(() => scheduleMeasure());

    const updateObserved = () => {
      const fixedElements = Array.from(
        outer.querySelectorAll<HTMLElement>('[data-params-fixed="true"]'),
      );
      const nextSet = new Set(fixedElements);
      for (const el of observed) {
        if (!nextSet.has(el)) {
          resizeObserver.unobserve(el);
          observed.delete(el);
        }
      }
      for (const el of nextSet) {
        if (!observed.has(el)) {
          resizeObserver.observe(el);
          observed.add(el);
        }
      }
      return fixedElements;
    };

    const updateFixedHeight = () => {
      if (!outer) {
        return;
      }
      const fixedElements = updateObserved();
      const outerStyle = window.getComputedStyle(outer);
      const paddingHeight =
        (Number.parseFloat(outerStyle.paddingTop) || 0) +
        (Number.parseFloat(outerStyle.paddingBottom) || 0);
      const outerMarginHeight =
        (Number.parseFloat(outerStyle.marginTop) || 0) +
        (Number.parseFloat(outerStyle.marginBottom) || 0);
      let totalHeight = paddingHeight + outerMarginHeight;
      for (const element of fixedElements) {
        const style = window.getComputedStyle(element);
        const marginHeight =
          (Number.parseFloat(style.marginTop) || 0) +
          (Number.parseFloat(style.marginBottom) || 0);
        totalHeight += element.offsetHeight + marginHeight;
      }
      const nextFixedHeight = Math.round(totalHeight);
      if (waitingForResultRef.current) {
        pendingFixedHeightRef.current = nextFixedHeight;
        return;
      }
      if (lastFixedHeightRef.current === nextFixedHeight) {
        return;
      }
      lastFixedHeightRef.current = nextFixedHeight;
      useTemporaryMiscState.setState({
        [paramsFixedHeightKey]: nextFixedHeight,
      });
    };

    const scheduleMeasure = () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      frameId = requestAnimationFrame(updateFixedHeight);
    };

    mutationObserver.observe(outer, { childList: true, subtree: true });
    scheduleMeasure();

    return () => {
      if (frameId) {
        cancelAnimationFrame(frameId);
      }
      mutationObserver.disconnect();
      resizeObserver.disconnect();
      observed.clear();
      lastFixedHeightRef.current = null;
      pendingFixedHeightRef.current = null;
      useTemporaryMiscState.setState({ [paramsFixedHeightKey]: 0 });
    };
  }, [paramsFixedHeightKey]);

  useEffect(() => {
    if (waitingForResult) {
      return;
    }
    const pendingHeight = pendingFixedHeightRef.current;
    if (pendingHeight === null) {
      return;
    }
    pendingFixedHeightRef.current = null;
    if (lastFixedHeightRef.current === pendingHeight) {
      return;
    }
    lastFixedHeightRef.current = pendingHeight;
    useTemporaryMiscState.setState({
      [paramsFixedHeightKey]: pendingHeight,
    });
  }, [paramsFixedHeightKey, waitingForResult]);

  const {
    edgeInputPorts,
    hideUnpinnedParams,
    paramFilter,
    positionAndSizeLocked,
    edgeInputParams,
    edgeOutputPorts,
    pinnedRequiredParamIdsToPaths,
    pinnedTopLevelParamIds,
    selectedParams,
    unpinnedRequiredParamIdsToPaths,
    unpinnedTopLevelParamIds,
    styleColor,
  } = useProjectState((state) => {
    const impl = getCurrEffectiveSectionImplWithTypeGuard(
      state,
      sectionId,
      isBaseSectionWithParamsImpl,
    );
    const pinned = getCurrShownParamIds(state, sectionId, true, true);
    const unpinned = getCurrShownParamIds(state, sectionId, false, true);

    return {
      edgeInputPorts: impl.edgeInputParams.map((paramId) => {
        const path = {
          ...pinned.requiredParamIdsToPaths,
          ...unpinned.requiredParamIdsToPaths,
        }[paramId];
        const rawLabel = path
          ? paramNameFromPathArray(state, sectionId, path)
          : getParamDisplayName(state, sectionId, paramId);
        const label = rawLabel.trim().length === 0 ? "(unnamed)" : rawLabel;
        return { id: paramId, label };
      }),
      hideUnpinnedParams: impl.hideUnpinnedParams,
      paramFilter: impl.paramFilter,
      positionAndSizeLocked: impl.positionAndSizeLocked,
      edgeInputParams: impl.edgeInputParams,
      edgeOutputPorts: impl.edgeOutputPorts.map((port) => ({
        id: port.id,
        label:
          port.accessor.trim() === ""
            ? C.EDGE_OUTPUT_BASE_LABEL
            : port.accessor,
      })),
      pinnedRequiredParamIdsToPaths: pinned.requiredParamIdsToPaths,
      pinnedTopLevelParamIds: pinned.topLevelParamIds,
      selectedParams: impl.selectedParams ?? [],
      unpinnedRequiredParamIdsToPaths: unpinned.requiredParamIdsToPaths,
      unpinnedTopLevelParamIds: unpinned.topLevelParamIds,
      styleColor: impl.styleColor ?? null,
    };
  }, _.isEqual);
  const { canEditLayout, canEditStructure } = useShareCapabilities();
  const isSelectingParams = useMisc((x) => x.isSelectingParams);
  const unpinnedParamsAreaMinHeight = useSettings(
    (state) => state.sectionSizingPolicy.globals.unpinnedParamsAreaMinHeight,
  );
  const allRequiredParamIdsToPaths = useMemo(
    () => ({
      ...pinnedRequiredParamIdsToPaths,
      ...unpinnedRequiredParamIdsToPaths,
    }),
    [pinnedRequiredParamIdsToPaths, unpinnedRequiredParamIdsToPaths],
  );
  const allTopLevelParamIds = useMemo(
    () => [...pinnedTopLevelParamIds, ...unpinnedTopLevelParamIds],
    [pinnedTopLevelParamIds, unpinnedTopLevelParamIds],
  );
  const displayNamesById = useProjectState(
    (state) =>
      buildParamDisplayNameMap({
        state,
        sectionId,
        topLevelParamIds: allTopLevelParamIds,
        requiredParamIdsToPaths: allRequiredParamIdsToPaths,
      }),
    _.isEqual,
  );
  const liveDictAreaSurface = useMemo(
    () =>
      buildLiveDictAreaSurface({
        bgColor,
        canConnect: canEditStructure && !isSelectingParams,
        edgeInputParams,
        hideUnpinnedParams,
        paramFilter,
        getParamDisplayName: (paramId: string) =>
          displayNamesById[paramId] ?? paramId,
        handleColumnResizeStart,
        inputPorts: edgeInputPorts,
        isSelectingParams,
        outputPorts: edgeOutputPorts,
        pinned: {
          requiredParamIdsToPaths: pinnedRequiredParamIdsToPaths,
          topLevelParamIds: pinnedTopLevelParamIds,
        },
        positionAndSizeLocked,
        sectionId,
        sectionTypeName,
        selectedParamIds: selectedParams,
        styleColor,
        unpinned: {
          canEditLayout,
          configuredMinHeight: unpinnedParamsAreaMinHeight,
          pinnedRequiredParamIdsToPaths,
          pinnedTopLevelParamIds,
          positionAndSizeLocked,
          requiredParamIdsToPaths: unpinnedRequiredParamIdsToPaths,
          topLevelParamIds: unpinnedTopLevelParamIds,
        },
      }),
    [
      bgColor,
      canEditLayout,
      canEditStructure,
      displayNamesById,
      edgeInputParams,
      edgeInputPorts,
      edgeOutputPorts,
      handleColumnResizeStart,
      hideUnpinnedParams,
      isSelectingParams,
      paramFilter,
      pinnedRequiredParamIdsToPaths,
      pinnedTopLevelParamIds,
      positionAndSizeLocked,
      sectionId,
      sectionTypeName,
      selectedParams,
      styleColor,
      unpinnedParamsAreaMinHeight,
      unpinnedRequiredParamIdsToPaths,
      unpinnedTopLevelParamIds,
    ],
  );

  useEffect(() => {
    setMaxNestedDepth(liveDictAreaSurface.maxNestedDepth);
  }, [liveDictAreaSurface.maxNestedDepth, setMaxNestedDepth]);

  return (
    <ParamDndContext>
      <div
        className="section-row-pin-main section-w-full relative -mt-3 flex min-h-0 flex-col pt-2"
        ref={setOuterRef}
      >
        {waitingForResult && (
          <div className="pointer-events-auto absolute inset-0 z-10 flex items-start justify-center bg-transparent pt-3">
            <i className="section-args gg-spinner !scale-100 before:!border-t-blue-500 after:!border-blue-500" />
          </div>
        )}
        <LiveDictAreaMount liveDictAreaSurface={liveDictAreaSurface} />
      </div>
    </ParamDndContext>
  );
}

export const ParamGroupContainer = React.memo(_ParamGroupContainer);

function buildParamDisplayNameMap({
  state,
  sectionId,
  topLevelParamIds,
  requiredParamIdsToPaths,
}: {
  state: ZustandProjectState;
  sectionId: string;
  topLevelParamIds: string[];
  requiredParamIdsToPaths: Record<string, string[]>;
}): Record<string, string> {
  const paramIds = new Set(topLevelParamIds);

  Object.values(requiredParamIdsToPaths).forEach((path) => {
    path.forEach((paramId) => {
      paramIds.add(paramId);
    });
  });

  const displayNamesById: Record<string, string> = {};
  for (const paramId of paramIds) {
    displayNamesById[paramId] = getParamDisplayName(state, sectionId, paramId);
  }

  return displayNamesById;
}
