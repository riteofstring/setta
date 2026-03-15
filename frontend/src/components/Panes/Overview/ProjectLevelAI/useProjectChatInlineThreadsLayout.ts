import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import { useLocalStorage } from "state/stores/uiPreferenceStores";
import { getSafeLocalStorageAdapter } from "utils/safeLocalStorage";
import {
  PROJECT_CHAT_INLINE_THREADS_MIN_WIDTH_PX,
  PROJECT_CHAT_INLINE_THREADS_WIDTH_STORAGE_KEY,
  isProjectChatLargeEnoughForInlineThreads,
  readProjectChatInlineThreadsStoredWidth,
  resolveProjectChatInlineThreadsMaxWidth,
  resolveProjectChatInlineThreadsWidth,
  resolveProjectChatThreadVisibilityFromResize,
} from "./projectChatInlineThreadsLayout";

export function useProjectChatInlineThreadsLayout({
  viewThreads,
  hasAuxView,
  projectChatThreadsExplicitlyClosedAtLargeWidth,
  setViewThreads,
}: {
  viewThreads: boolean;
  hasAuxView: boolean;
  projectChatThreadsExplicitlyClosedAtLargeWidth: boolean;
  setViewThreads: (next: SetStateAction<boolean>) => void;
}) {
  const overviewPaneWidth = useLocalStorage((state) => state.overviewWidth);
  const [chatContainerNode, setChatContainerNode] =
    useState<HTMLDivElement | null>(null);
  const [chatContainerWidth, setChatContainerWidth] = useState<number | null>(
    null,
  );
  const [inlineThreadsHeaderPortalTarget, setInlineThreadsHeaderPortalTarget] =
    useState<HTMLDivElement | null>(null);
  const inlineThreadsHeaderShellRef = useRef<HTMLDivElement | null>(null);
  const inlineThreadsResizableColumnRef = useRef<HTMLDivElement | null>(null);
  const hasInitializedInlineThreadsResizeSyncRef = useRef(false);
  const effectiveInlineThreadsViewportWidth =
    chatContainerWidth ?? overviewPaneWidth;
  const previousLargeEnoughForInlineThreadsRef = useRef(
    isProjectChatLargeEnoughForInlineThreads(
      effectiveInlineThreadsViewportWidth,
    ),
  );
  const inlineThreadsWidthStorage = useMemo(
    () => getSafeLocalStorageAdapter("project-chat-inline-threads"),
    [],
  );
  const [inlineThreadsWidth, setInlineThreadsWidth] = useState(() => {
    const storedWidth = Number(
      inlineThreadsWidthStorage.getItem(
        PROJECT_CHAT_INLINE_THREADS_WIDTH_STORAGE_KEY,
      ),
    );
    return readProjectChatInlineThreadsStoredWidth(storedWidth);
  });

  const handleChatContainerRef = useCallback((node: HTMLDivElement | null) => {
    setChatContainerNode(node);
  }, []);

  useEffect(() => {
    if (!chatContainerNode) {
      return;
    }

    const syncChatContainerWidth = (nextWidth: number) => {
      const roundedWidth = Math.max(0, Math.round(nextWidth));
      setChatContainerWidth((currentWidth) => {
        if (currentWidth === roundedWidth) {
          return currentWidth;
        }
        return roundedWidth;
      });
    };

    syncChatContainerWidth(chatContainerNode.getBoundingClientRect().width);

    if (typeof ResizeObserver === "undefined") {
      return;
    }

    const resizeObserver = new ResizeObserver((entries) => {
      const firstEntry = entries[0];
      if (!firstEntry) {
        return;
      }
      syncChatContainerWidth(firstEntry.contentRect.width);
    });
    resizeObserver.observe(chatContainerNode);

    return () => {
      resizeObserver.disconnect();
    };
  }, [chatContainerNode]);

  useEffect(() => {
    const isLargeEnoughForInlineThreads =
      isProjectChatLargeEnoughForInlineThreads(
        effectiveInlineThreadsViewportWidth,
      );
    const nextVisibility = resolveProjectChatThreadVisibilityFromResize({
      isInitialRun: !hasInitializedInlineThreadsResizeSyncRef.current,
      wasLargeEnoughForInlineThreads:
        previousLargeEnoughForInlineThreadsRef.current,
      isLargeEnoughForInlineThreads,
      viewThreads,
      explicitlyClosedAtLargeWidth:
        projectChatThreadsExplicitlyClosedAtLargeWidth,
    });
    previousLargeEnoughForInlineThreadsRef.current =
      isLargeEnoughForInlineThreads;
    hasInitializedInlineThreadsResizeSyncRef.current = true;
    if (nextVisibility === null || nextVisibility === viewThreads) {
      return;
    }
    setViewThreads(nextVisibility);
  }, [
    effectiveInlineThreadsViewportWidth,
    projectChatThreadsExplicitlyClosedAtLargeWidth,
    setViewThreads,
    viewThreads,
  ]);

  const showInlineThreads =
    viewThreads &&
    isProjectChatLargeEnoughForInlineThreads(
      effectiveInlineThreadsViewportWidth,
    );
  const inlineThreadsMaxWidth = useMemo(
    () =>
      resolveProjectChatInlineThreadsMaxWidth(
        effectiveInlineThreadsViewportWidth,
      ),
    [effectiveInlineThreadsViewportWidth],
  );
  const resolvedInlineThreadsWidth = useMemo(
    () =>
      resolveProjectChatInlineThreadsWidth({
        requestedWidth: inlineThreadsWidth,
        viewportWidth: effectiveInlineThreadsViewportWidth,
      }),
    [effectiveInlineThreadsViewportWidth, inlineThreadsWidth],
  );
  const canResizeInlineThreads =
    inlineThreadsMaxWidth > PROJECT_CHAT_INLINE_THREADS_MIN_WIDTH_PX;

  const updateInlineThreadsWidth = useCallback(
    (nextWidth: number) => {
      const resolvedWidth = resolveProjectChatInlineThreadsWidth({
        requestedWidth: nextWidth,
        viewportWidth: effectiveInlineThreadsViewportWidth,
      });
      setInlineThreadsWidth((current) => {
        if (current === resolvedWidth) {
          return current;
        }
        return resolvedWidth;
      });
    },
    [effectiveInlineThreadsViewportWidth],
  );

  useEffect(() => {
    if (inlineThreadsWidth === resolvedInlineThreadsWidth) {
      return;
    }
    setInlineThreadsWidth(resolvedInlineThreadsWidth);
  }, [inlineThreadsWidth, resolvedInlineThreadsWidth]);

  const syncInlineThreadsHeaderWidth = useCallback((nextWidth: number) => {
    const inlineThreadsHeaderShellNode = inlineThreadsHeaderShellRef.current;
    if (!inlineThreadsHeaderShellNode) {
      return;
    }
    inlineThreadsHeaderShellNode.style.width = `${Math.max(
      0,
      Math.round(nextWidth),
    )}px`;
  }, []);

  useEffect(() => {
    if (!showInlineThreads) {
      return;
    }
    syncInlineThreadsHeaderWidth(resolvedInlineThreadsWidth);
  }, [
    resolvedInlineThreadsWidth,
    showInlineThreads,
    syncInlineThreadsHeaderWidth,
  ]);

  useEffect(() => {
    if (!showInlineThreads || typeof ResizeObserver === "undefined") {
      return;
    }
    const inlineThreadsResizableColumnNode =
      inlineThreadsResizableColumnRef.current;
    if (!inlineThreadsResizableColumnNode) {
      return;
    }
    const resizeObserver = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) {
        return;
      }
      syncInlineThreadsHeaderWidth(entry.contentRect.width);
    });
    resizeObserver.observe(inlineThreadsResizableColumnNode);
    return () => {
      resizeObserver.disconnect();
    };
  }, [showInlineThreads, syncInlineThreadsHeaderWidth]);

  useEffect(() => {
    inlineThreadsWidthStorage.setItem(
      PROJECT_CHAT_INLINE_THREADS_WIDTH_STORAGE_KEY,
      String(inlineThreadsWidth),
    );
  }, [inlineThreadsWidth, inlineThreadsWidthStorage]);

  const handleInlineThreadsHeaderHostRef = useCallback(
    (node: HTMLDivElement | null) => {
      setInlineThreadsHeaderPortalTarget(node);
    },
    [],
  );

  const handleInlineThreadsHeaderShellRef = useCallback(
    (node: HTMLDivElement | null) => {
      inlineThreadsHeaderShellRef.current = node;
      if (!node) {
        return;
      }
      node.style.width = `${Math.round(resolvedInlineThreadsWidth)}px`;
    },
    [resolvedInlineThreadsWidth],
  );

  const handleInlineThreadsResizableColumnRef = useCallback(
    (node: HTMLDivElement | null) => {
      inlineThreadsResizableColumnRef.current = node;
    },
    [],
  );

  const handleInlineThreadsResize = useCallback(
    (nextWidth: number) => {
      syncInlineThreadsHeaderWidth(nextWidth);
    },
    [syncInlineThreadsHeaderWidth],
  );

  const handleInlineThreadsResizeStop = useCallback(
    (nextWidth: number) => {
      syncInlineThreadsHeaderWidth(nextWidth);
      updateInlineThreadsWidth(nextWidth);
    },
    [syncInlineThreadsHeaderWidth, updateInlineThreadsWidth],
  );

  return {
    handleChatContainerRef,
    inlineThreadsHeaderPortalTarget,
    handleInlineThreadsHeaderHostRef,
    handleInlineThreadsHeaderShellRef,
    handleInlineThreadsResizableColumnRef,
    showInlineThreads,
    showThreadsOnlyView: viewThreads && !showInlineThreads && !hasAuxView,
    isLargeEnoughForInlineThreads: isProjectChatLargeEnoughForInlineThreads(
      effectiveInlineThreadsViewportWidth,
    ),
    resolvedInlineThreadsWidth,
    inlineThreadsMaxWidth,
    canResizeInlineThreads,
    handleInlineThreadsResize,
    handleInlineThreadsResizeStop,
  };
}
