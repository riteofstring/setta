import { useCallback, useEffect, useLayoutEffect, useRef } from "react";
import { useTemporaryMiscState } from "state/definitions";
import { useParametersRequestWaitingForLSPResult } from "state/hooks/lsp";
import { getParamsFixedHeightKey } from "utils/constants";
import type { LiveDictAreaSectionContainerProps } from "./groupContainerLiveDictAreaSectionContainer";

export type GroupContainerShellBoundaryInput = Pick<
  LiveDictAreaSectionContainerProps,
  "bgColor" | "sectionId" | "sectionTypeName"
>;

export type GroupContainerShellBoundary = {
  liveDictAreaSectionContainerProps: LiveDictAreaSectionContainerProps;
  setOuterRef: (node: HTMLDivElement | null) => void;
  waitingForResult: boolean;
};

export function useGroupContainerShellBoundary({
  bgColor,
  sectionId,
  sectionTypeName,
}: GroupContainerShellBoundaryInput): GroupContainerShellBoundary {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const paramsFixedHeightKey = getParamsFixedHeightKey(sectionId);
  const lastFixedHeightRef = useRef<number | null>(null);
  const pendingFixedHeightRef = useRef<number | null>(null);
  const waitingForResult = useParametersRequestWaitingForLSPResult(sectionId);
  const waitingForResultRef = useRef(waitingForResult);

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
      for (const element of observed) {
        if (!nextSet.has(element)) {
          resizeObserver.unobserve(element);
          observed.delete(element);
        }
      }
      for (const element of nextSet) {
        if (!observed.has(element)) {
          resizeObserver.observe(element);
          observed.add(element);
        }
      }
      return fixedElements;
    };

    const updateFixedHeight = () => {
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

  return {
    liveDictAreaSectionContainerProps: {
      bgColor,
      outerRef,
      sectionId,
      sectionTypeName,
    },
    setOuterRef,
    waitingForResult,
  };
}
