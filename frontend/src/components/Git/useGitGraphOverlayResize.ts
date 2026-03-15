import {
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
import {
  CSS_VAR_GIT_GRAPH_SPLIT_PCT,
  DEFAULT_GIT_GRAPH_SPLIT_PCT,
  buildGitGraphColumnPersistPatch,
  clampGitGraphColumnWidths,
  clampGitGraphSplitPct,
  finalizeGitGraphColumnWidths,
  getGitGraphColumnCssVar,
  measureGitGraphColumnContentWidth,
  resolveGitGraphColumnResetWidths,
  resolveGitGraphColumnWidthsFromDelta,
  resolveGitGraphPaneSplitPct,
  type GitGraphColumnBoundary,
  type GitGraphColumnWidthPatch,
  type GitGraphColumnWidths,
} from "./gitGraphOverlayResizeModel";

function applyGitGraphColumnWidths(
  root: HTMLElement,
  next: GitGraphColumnWidthPatch,
): void {
  if (next.graph !== undefined) {
    root.style.setProperty(getGitGraphColumnCssVar("graph"), `${next.graph}px`);
  }
  if (next.author !== undefined) {
    root.style.setProperty(
      getGitGraphColumnCssVar("author"),
      `${next.author}px`,
    );
  }
  if (next.date !== undefined) {
    root.style.setProperty(getGitGraphColumnCssVar("date"), `${next.date}px`);
  }
  if (next.hash !== undefined) {
    root.style.setProperty(getGitGraphColumnCssVar("hash"), `${next.hash}px`);
  }
}

function readGitGraphColumnWidth(
  root: HTMLElement,
  key: keyof GitGraphColumnWidths,
  fallbackPx: number,
): number {
  const raw = window
    .getComputedStyle(root)
    .getPropertyValue(getGitGraphColumnCssVar(key))
    .trim();
  const parsed = Number.parseFloat(raw);
  if (Number.isFinite(parsed) && parsed > 0) {
    return parsed;
  }
  return fallbackPx;
}

type UseGitGraphOverlayResizeArgs = {
  overlayRef: RefObject<HTMLElement | null>;
  panesWrapperRef: RefObject<HTMLDivElement | null>;
  commitHeaderRef: RefObject<HTMLDivElement | null>;
  splitPct: number;
  graphColWidthPx: number;
  authorColWidthPx: number;
  dateColWidthPx: number;
  hashColWidthPx: number;
};

export function useGitGraphOverlayResize({
  overlayRef,
  panesWrapperRef,
  commitHeaderRef,
  splitPct,
  graphColWidthPx,
  authorColWidthPx,
  dateColWidthPx,
  hashColWidthPx,
}: UseGitGraphOverlayResizeArgs): {
  beginPaneSplitDrag: (event: ReactPointerEvent<HTMLDivElement>) => void;
  beginColumnResizeDrag: (
    boundary: GitGraphColumnBoundary,
    event: ReactPointerEvent<HTMLDivElement>,
  ) => void;
  graphViewBoxWidth: number;
} {
  const activeDragCleanupsRef = useRef(new Set<() => void>());
  const [liveGraphColWidthPx, setLiveGraphColWidthPx] = useState<number | null>(
    null,
  );

  function registerDragCleanup(cleanup: () => void): () => void {
    let isCleanedUp = false;
    const wrappedCleanup = () => {
      if (isCleanedUp) {
        return;
      }
      isCleanedUp = true;
      activeDragCleanupsRef.current.delete(wrappedCleanup);
      cleanup();
    };
    activeDragCleanupsRef.current.add(wrappedCleanup);
    return wrappedCleanup;
  }

  function requestPersistIfConnected(persist: () => void): void {
    requestAnimationFrame(() => {
      const root = overlayRef.current;
      if (!root?.isConnected) {
        return;
      }
      persist();
    });
  }

  useEffect(() => {
    const root = overlayRef.current;
    if (!root) {
      return;
    }
    root.style.setProperty(
      CSS_VAR_GIT_GRAPH_SPLIT_PCT,
      clampGitGraphSplitPct(splitPct).toString(),
    );
    applyGitGraphColumnWidths(
      root,
      clampGitGraphColumnWidths({
        graph: graphColWidthPx,
        author: authorColWidthPx,
        date: dateColWidthPx,
        hash: hashColWidthPx,
      }),
    );
  }, [
    authorColWidthPx,
    dateColWidthPx,
    graphColWidthPx,
    hashColWidthPx,
    overlayRef,
    splitPct,
  ]);

  useEffect(() => {
    // Reset the temporary drag width once persisted state catches up.
    setLiveGraphColWidthPx(null);
  }, [graphColWidthPx]);

  useEffect(() => {
    return () => {
      const pendingCleanups = Array.from(activeDragCleanupsRef.current);
      activeDragCleanupsRef.current.clear();
      for (const cleanup of pendingCleanups) {
        cleanup();
      }
    };
  }, []);

  function beginPaneSplitDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    event.preventDefault();
    event.stopPropagation();

    const root = overlayRef.current;
    const wrapper = panesWrapperRef.current;
    if (!root || !wrapper) {
      return;
    }
    const wrapperWidth = wrapper.clientWidth;
    if (!wrapperWidth) {
      return;
    }
    const handleWidth = event.currentTarget.getBoundingClientRect().width;

    if (event.detail === 2) {
      const nextPct = clampGitGraphSplitPct(DEFAULT_GIT_GRAPH_SPLIT_PCT);
      root.style.setProperty(CSS_VAR_GIT_GRAPH_SPLIT_PCT, nextPct.toString());
      useLocalStorage.setState({ gitGraphSplitPct: nextPct });
      return;
    }

    const pointerId = event.pointerId;
    const startX = event.clientX;
    let rafId: number | null = null;
    let latestPct = clampGitGraphSplitPct(splitPct);

    const handleMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) {
        return;
      }
      latestPct = resolveGitGraphPaneSplitPct({
        wrapperWidth,
        handleWidth,
        splitPct,
        deltaX: moveEvent.clientX - startX,
      });
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        root.style.setProperty(
          CSS_VAR_GIT_GRAPH_SPLIT_PCT,
          latestPct.toString(),
        );
        rafId = null;
      });
    };

    const handleUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) {
        return;
      }
      const persisted = clampGitGraphSplitPct(latestPct);
      if (root.isConnected) {
        root.style.setProperty(
          CSS_VAR_GIT_GRAPH_SPLIT_PCT,
          persisted.toString(),
        );
      }
      teardownDrag();
      requestPersistIfConnected(() => {
        useLocalStorage.setState({ gitGraphSplitPct: persisted });
      });
    };

    const teardownDrag = registerDragCleanup(() => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    });

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
  }

  function beginColumnResizeDrag(
    boundary: GitGraphColumnBoundary,
    event: ReactPointerEvent<HTMLDivElement>,
  ): void {
    event.preventDefault();
    event.stopPropagation();

    const root = overlayRef.current;
    const header = commitHeaderRef.current;
    if (!root || !header) {
      return;
    }

    const headerStyle = window.getComputedStyle(header);
    const contentWidth = measureGitGraphColumnContentWidth({
      headerClientWidth: header.clientWidth,
      paddingLeftPx: Number.parseFloat(headerStyle.paddingLeft) || 0,
      paddingRightPx: Number.parseFloat(headerStyle.paddingRight) || 0,
      columnGapPx: Number.parseFloat(headerStyle.columnGap) || 0,
    });
    const startWidths: GitGraphColumnWidths = {
      graph: readGitGraphColumnWidth(root, "graph", graphColWidthPx),
      author: readGitGraphColumnWidth(root, "author", authorColWidthPx),
      date: readGitGraphColumnWidth(root, "date", dateColWidthPx),
      hash: readGitGraphColumnWidth(root, "hash", hashColWidthPx),
    };

    const persistWidths = (next: GitGraphColumnWidthPatch) => {
      const patch = buildGitGraphColumnPersistPatch(next);
      if (Object.keys(patch).length > 0) {
        useLocalStorage.setState(patch);
      }
    };

    if (event.detail === 2) {
      const next = resolveGitGraphColumnResetWidths({
        boundary,
        startWidths,
        contentWidth,
      });
      applyGitGraphColumnWidths(root, next);
      if (next.graph !== undefined) {
        setLiveGraphColWidthPx(next.graph);
      }
      persistWidths(next);
      return;
    }

    const pointerId = event.pointerId;
    const startX = event.clientX;
    let rafId: number | null = null;
    let latestWidths = { ...startWidths };

    const handleMove = (moveEvent: PointerEvent) => {
      if (moveEvent.pointerId !== pointerId) {
        return;
      }
      const next = resolveGitGraphColumnWidthsFromDelta({
        boundary,
        startWidths,
        contentWidth,
        deltaX: moveEvent.clientX - startX,
      });
      latestWidths = { ...latestWidths, ...next };
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
      }
      rafId = requestAnimationFrame(() => {
        applyGitGraphColumnWidths(root, next);
        if (next.graph !== undefined) {
          setLiveGraphColWidthPx(next.graph);
        }
        rafId = null;
      });
    };

    const handleUp = (upEvent: PointerEvent) => {
      if (upEvent.pointerId !== pointerId) {
        return;
      }
      const persisted = finalizeGitGraphColumnWidths({
        boundary,
        widths: latestWidths,
      });
      if (root.isConnected) {
        if (persisted.graph !== undefined) {
          setLiveGraphColWidthPx(persisted.graph);
        }
        applyGitGraphColumnWidths(root, persisted);
      }
      teardownDrag();
      requestPersistIfConnected(() => {
        persistWidths(persisted);
      });
    };

    const teardownDrag = registerDragCleanup(() => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleUp);
      window.removeEventListener("pointercancel", handleUp);
      if (rafId !== null) {
        cancelAnimationFrame(rafId);
        rafId = null;
      }
    });

    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleUp);
    window.addEventListener("pointercancel", handleUp);
  }

  return {
    beginPaneSplitDrag,
    beginColumnResizeDrag,
    graphViewBoxWidth: Math.max(1, liveGraphColWidthPx ?? graphColWidthPx),
  };
}
