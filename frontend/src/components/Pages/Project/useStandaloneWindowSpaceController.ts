import { type ManagedChatSurfaceAuthorityState } from "components/Chat/sharePolicyChatAccess";
import { type FloatingSnapResizeHandle } from "components/ChatWindowing/projectChatSnapLayout";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import { useProjectState } from "state/definitions";
import { type WindowSpaceConfig } from "utils/generatedTypes";
import { shallow } from "zustand/shallow";
import {
  applyStandaloneBlockedManagedWindowErrorCode,
  applyStandaloneWindowSpaceHydration,
  beginStandaloneSnapResize,
  buildStandaloneSnapResizeNextBounds,
  buildStandaloneWindowSpaceResizeHandles,
  buildVisibleStandaloneWindows,
  clearStandaloneBlockedManagedWindowIds,
  focusStandaloneWindow,
  hasStandaloneManagedWindows,
  hydrateWindowSpaceWindows,
  reconcileStandaloneBlockedManagedWindowIds,
  setStandaloneEmbeddedGitPaneVisibility,
  setStandaloneProjectChatWindowChatId,
  updateStandaloneWindowBounds,
  type ActiveStandaloneSnapResize,
} from "./standaloneWindowSpaceState";

export function useStandaloneWindowSpaceController({
  windowSpace,
  canUseManagedChat,
  managedChatAuthorityState,
}: {
  windowSpace: WindowSpaceConfig;
  canUseManagedChat: boolean;
  managedChatAuthorityState: ManagedChatSurfaceAuthorityState;
}) {
  const containerRef = useRef<HTMLElement | null>(null);
  const projectConfigId = useProjectState((state) => state.projectConfig.id);
  const sectionNamesById = useProjectState(
    (state) =>
      Object.fromEntries(
        Object.entries(state.sections).map(([sectionId, section]) => [
          sectionId,
          section.name,
        ]),
      ),
    shallow,
  );
  const [viewportSize, setViewportSize] = useState(() => ({
    width: typeof window === "undefined" ? 1440 : window.innerWidth,
    height: typeof window === "undefined" ? 900 : window.innerHeight,
  }));

  useEffect(() => {
    if (typeof ResizeObserver === "undefined") {
      return;
    }
    const container = containerRef.current;
    if (!container) {
      return;
    }
    const updateViewportSize = () => {
      const nextWidth = container.clientWidth;
      const nextHeight = container.clientHeight;
      if (nextWidth <= 0 || nextHeight <= 0) {
        return;
      }
      setViewportSize((current) => {
        if (current.width === nextWidth && current.height === nextHeight) {
          return current;
        }
        return {
          width: nextWidth,
          height: nextHeight,
        };
      });
    };
    updateViewportSize();
    const observer = new ResizeObserver(updateViewportSize);
    observer.observe(container);
    return () => {
      observer.disconnect();
    };
  }, []);

  const hydratedWindowsById = useMemo(
    () =>
      hydrateWindowSpaceWindows(
        windowSpace,
        viewportSize.width,
        viewportSize.height,
        sectionNamesById,
      ),
    [sectionNamesById, viewportSize.height, viewportSize.width, windowSpace],
  );
  const [localWindowsById, setLocalWindowsById] = useState(hydratedWindowsById);
  const [blockedManagedWindowIds, setBlockedManagedWindowIds] = useState<
    Record<string, true>
  >({});
  const activeSnapResizeRef = useRef<ActiveStandaloneSnapResize | null>(null);
  const previousHydratedWindowsByIdRef = useRef(hydratedWindowsById);
  const hydrationKey = `${projectConfigId}:${windowSpace.id}`;
  const previousHydrationKeyRef = useRef(hydrationKey);
  const previousCanUseManagedChatRef = useRef(canUseManagedChat);

  useEffect(() => {
    setLocalWindowsById((current) => {
      const result = applyStandaloneWindowSpaceHydration({
        currentWindowsById: current,
        previousHydratedWindowsById: previousHydratedWindowsByIdRef.current,
        nextHydratedWindowsById: hydratedWindowsById,
        previousHydrationKey: previousHydrationKeyRef.current,
        nextHydrationKey: hydrationKey,
      });
      previousHydratedWindowsByIdRef.current =
        result.nextPreviousHydratedWindowsById;
      previousHydrationKeyRef.current = result.nextHydrationKey;
      if (result.resetLocalState) {
        activeSnapResizeRef.current = null;
      }
      return result.nextLocalWindowsById;
    });
  }, [hydratedWindowsById, hydrationKey]);

  useEffect(() => {
    setBlockedManagedWindowIds(clearStandaloneBlockedManagedWindowIds);
  }, [hydrationKey]);

  useEffect(() => {
    setBlockedManagedWindowIds((current) =>
      reconcileStandaloneBlockedManagedWindowIds({
        currentBlockedWindowIds: current,
        localWindowsById,
        managedChatAuthorityState,
      }),
    );
  }, [localWindowsById, managedChatAuthorityState]);

  useEffect(() => {
    if (!previousCanUseManagedChatRef.current && canUseManagedChat) {
      setBlockedManagedWindowIds(clearStandaloneBlockedManagedWindowIds);
    }
    previousCanUseManagedChatRef.current = canUseManagedChat;
  }, [canUseManagedChat]);

  const visibleWindows = useMemo(
    () =>
      buildVisibleStandaloneWindows({
        localWindowsById,
        blockedManagedWindowIds,
        canUseManagedChat,
        managedChatAuthorityState,
      }),
    [
      blockedManagedWindowIds,
      canUseManagedChat,
      localWindowsById,
      managedChatAuthorityState,
    ],
  );
  const hasManagedWindows = useMemo(
    () =>
      hasStandaloneManagedWindows(localWindowsById, managedChatAuthorityState),
    [localWindowsById, managedChatAuthorityState],
  );
  const shouldShowManagedChatBlockedSurface =
    visibleWindows.length === 0 && hasManagedWindows;
  const snapResizeHandles = useMemo(
    () =>
      buildStandaloneWindowSpaceResizeHandles({
        visibleWindows,
        viewportWidthPx: viewportSize.width,
        viewportHeightPx: viewportSize.height,
      }),
    [viewportSize.height, viewportSize.width, visibleWindows],
  );

  const handleFocusWindow = (instanceId: string) => {
    setLocalWindowsById((current) =>
      focusStandaloneWindow(current, instanceId),
    );
  };

  const handleProjectChatIdChange = (
    instanceId: string,
    chatId: string | null | undefined,
  ) => {
    setLocalWindowsById((current) =>
      setStandaloneProjectChatWindowChatId(current, instanceId, chatId),
    );
  };

  const handleEmbeddedGitPaneVisibleChange = (
    instanceId: string,
    visible: boolean,
  ) => {
    setLocalWindowsById((current) =>
      setStandaloneEmbeddedGitPaneVisibility(current, instanceId, visible),
    );
  };

  const handleBlockedErrorCodeChange = (
    instanceId: string,
    errorCode: string | null,
  ) => {
    setBlockedManagedWindowIds((current) =>
      applyStandaloneBlockedManagedWindowErrorCode({
        currentBlockedWindowIds: current,
        instanceId,
        errorCode,
      }),
    );
  };

  const handleSnapResizePointerDown = (
    event: PointerEvent<HTMLDivElement>,
    handle: FloatingSnapResizeHandle,
  ) => {
    if (event.button !== 0) {
      return;
    }
    const pointerPosition =
      handle.axis === "vertical" ? event.clientX : event.clientY;
    const activeResize = beginStandaloneSnapResize({
      handle,
      pointerId: event.pointerId,
      pointerPosition,
      windowsById: localWindowsById,
    });
    if (!activeResize) {
      return;
    }
    activeSnapResizeRef.current = activeResize;
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleSnapResizePointerMove = (event: PointerEvent<HTMLDivElement>) => {
    const activeResize = activeSnapResizeRef.current;
    if (!activeResize || activeResize.pointerId !== event.pointerId) {
      return;
    }
    const pointerPosition =
      activeResize.axis === "vertical" ? event.clientX : event.clientY;
    setLocalWindowsById((current) =>
      updateStandaloneWindowBounds(
        current,
        buildStandaloneSnapResizeNextBounds({
          activeResize,
          pointerPosition,
        }),
      ),
    );
  };

  const handleSnapResizePointerUp = (event: PointerEvent<HTMLDivElement>) => {
    const activeResize = activeSnapResizeRef.current;
    if (!activeResize || activeResize.pointerId !== event.pointerId) {
      return;
    }
    activeSnapResizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  };

  return {
    containerRef,
    projectConfigId,
    visibleWindows,
    shouldShowManagedChatBlockedSurface,
    snapResizeHandles,
    handleFocusWindow,
    handleProjectChatIdChange,
    handleEmbeddedGitPaneVisibleChange,
    handleBlockedErrorCodeChange,
    handleSnapResizePointerDown,
    handleSnapResizePointerMove,
    handleSnapResizePointerUp,
  };
}
