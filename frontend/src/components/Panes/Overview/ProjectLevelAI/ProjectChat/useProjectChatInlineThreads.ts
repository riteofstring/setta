import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type SetStateAction,
} from "react";
import { getSafeLocalStorageAdapter } from "utils/safeLocalStorage";
import { clamp } from "utils/utils";
import { resolveProjectChatThreadVisibilityFromResize } from "../projectChatConversationState";
import {
  INLINE_THREADS_BREAKPOINT_PX,
  INLINE_THREADS_DEFAULT_WIDTH_PX,
  INLINE_THREADS_MAX_WIDTH_PX,
  INLINE_THREADS_MIN_CHAT_WIDTH_PX,
  INLINE_THREADS_MIN_WIDTH_PX,
  INLINE_THREADS_WIDTH_STORAGE_KEY,
} from "./constants";

export function useProjectChatInlineThreads({
  overviewPaneWidth,
  viewThreads,
  projectChatThreadsExplicitlyClosedAtLargeWidth,
  setViewThreads,
}: {
  overviewPaneWidth: number;
  viewThreads: boolean;
  projectChatThreadsExplicitlyClosedAtLargeWidth: boolean;
  setViewThreads: (nextVisibility: SetStateAction<boolean>) => void;
}) {
  const [chatContainerNode, setChatContainerNode] =
    useState<HTMLDivElement | null>(null);
  const [chatContainerWidth, setChatContainerWidth] = useState<number | null>(
    null,
  );
  const inlineThreadsWidthStorage = useMemo(
    () => getSafeLocalStorageAdapter("project-chat-inline-threads"),
    [],
  );
  const [inlineThreadsWidth, setInlineThreadsWidth] = useState(() => {
    const stored = Number(
      inlineThreadsWidthStorage.getItem(INLINE_THREADS_WIDTH_STORAGE_KEY),
    );
    if (!Number.isFinite(stored)) {
      return INLINE_THREADS_DEFAULT_WIDTH_PX;
    }
    return stored;
  });
  const [inlineThreadsHeaderPortalTarget, setInlineThreadsHeaderPortalTarget] =
    useState<HTMLDivElement | null>(null);
  const inlineThreadsHeaderShellRef = useRef<HTMLDivElement | null>(null);
  const inlineThreadsResizableColumnRef = useRef<HTMLDivElement | null>(null);
  const effectiveInlineThreadsViewportWidth =
    chatContainerWidth ?? overviewPaneWidth;
  const hasInitializedInlineThreadsResizeSyncRef = useRef(false);
  const previousLargeEnoughForInlineThreadsRef = useRef(
    effectiveInlineThreadsViewportWidth >= INLINE_THREADS_BREAKPOINT_PX,
  );

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
      effectiveInlineThreadsViewportWidth >= INLINE_THREADS_BREAKPOINT_PX;
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
    effectiveInlineThreadsViewportWidth >= INLINE_THREADS_BREAKPOINT_PX;
  const inlineThreadsMaxWidth = useMemo(() => {
    const boundedMaxWidth = clamp(
      effectiveInlineThreadsViewportWidth - INLINE_THREADS_MIN_CHAT_WIDTH_PX,
      INLINE_THREADS_MIN_WIDTH_PX,
      INLINE_THREADS_MAX_WIDTH_PX,
    );
    return boundedMaxWidth;
  }, [effectiveInlineThreadsViewportWidth]);
  const resolvedInlineThreadsWidth = useMemo(() => {
    return clamp(
      inlineThreadsWidth,
      INLINE_THREADS_MIN_WIDTH_PX,
      inlineThreadsMaxWidth,
    );
  }, [inlineThreadsMaxWidth, inlineThreadsWidth]);
  const canResizeInlineThreads =
    inlineThreadsMaxWidth > INLINE_THREADS_MIN_WIDTH_PX;

  const updateInlineThreadsWidth = useCallback(
    (nextWidth: number) => {
      const resolvedWidth = clamp(
        nextWidth,
        INLINE_THREADS_MIN_WIDTH_PX,
        inlineThreadsMaxWidth,
      );
      setInlineThreadsWidth((current) => {
        if (current === resolvedWidth) {
          return current;
        }
        return resolvedWidth;
      });
    },
    [inlineThreadsMaxWidth],
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
      INLINE_THREADS_WIDTH_STORAGE_KEY,
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

  return {
    effectiveInlineThreadsViewportWidth,
    showInlineThreads,
    inlineThreadsMaxWidth,
    resolvedInlineThreadsWidth,
    canResizeInlineThreads,
    inlineThreadsHeaderPortalTarget,
    handleChatContainerRef,
    handleInlineThreadsHeaderHostRef,
    handleInlineThreadsHeaderShellRef,
    handleInlineThreadsResizableColumnRef,
    syncInlineThreadsHeaderWidth,
    updateInlineThreadsWidth,
  };
}
