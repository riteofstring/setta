import {
  windowSurfaceRequiresManagedChat,
  type ManagedChatSurfaceAuthorityState,
} from "components/Chat/sharePolicyChatAccess";
import {
  buildFloatingSnapResizeBounds,
  buildFloatingSnapResizeHandles,
  resolveFloatingSnapPresetFromBounds,
  type FloatingSnapPreset,
  type FloatingSnapResizeHandle,
} from "components/ChatWindowing/projectChatSnapLayout";
import { useEffect, useMemo, useRef, useState, type PointerEvent } from "react";
import type { ChatWindowBounds } from "utils/generatedTypes";
import {
  applyStandaloneWindowSpaceHydration,
  focusStandaloneWindow,
  setStandaloneEmbeddedGitPaneVisibility,
  setStandaloneProjectChatWindowChatId,
  updateStandaloneWindowBounds,
  type StandaloneWindowSpaceWindowMap,
} from "./standaloneWindowSpaceWindowModel";

type ActiveStandaloneSnapResize = {
  pointerId: number;
  axis: FloatingSnapResizeHandle["axis"];
  startPointerPosition: number;
  startCoordinate: number;
  minCoordinate: number;
  maxCoordinate: number;
  leadingInstanceIds: string[];
  trailingInstanceIds: string[];
  startBoundsByInstanceId: Record<string, ChatWindowBounds>;
};

type SnappedStandaloneWindow = {
  instanceId: string;
  bounds: ChatWindowBounds;
  snapPreset: FloatingSnapPreset;
};

type StandaloneWindowSpaceViewportSize = {
  width: number;
  height: number;
};

type UseStandaloneWindowSpaceWindowSessionInput = {
  canUseManagedChat: boolean;
  hydratedWindowsById: StandaloneWindowSpaceWindowMap;
  managedChatAuthorityState: ManagedChatSurfaceAuthorityState;
  projectConfigId: string;
  viewportSize: StandaloneWindowSpaceViewportSize;
  windowSpaceId: string;
};

const STANDALONE_WINDOW_SPACE_MIN_WIDTH_PX = 220;
const STANDALONE_WINDOW_SPACE_MIN_HEIGHT_PX = 180;

export function useStandaloneWindowSpaceWindowSession({
  canUseManagedChat,
  hydratedWindowsById,
  managedChatAuthorityState,
  projectConfigId,
  viewportSize,
  windowSpaceId,
}: UseStandaloneWindowSpaceWindowSessionInput) {
  const hydrationKey = `${projectConfigId}:${windowSpaceId}`;
  const [localWindowsById, setLocalWindowsById] = useState(hydratedWindowsById);
  const [blockedManagedWindowIds, setBlockedManagedWindowIds] = useState<
    Record<string, true>
  >({});
  const activeSnapResizeRef = useRef<ActiveStandaloneSnapResize | null>(null);
  const previousHydratedWindowsByIdRef = useRef(hydratedWindowsById);
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
    setBlockedManagedWindowIds((current) => {
      if (Object.keys(current).length === 0) {
        return current;
      }
      return {};
    });
  }, [hydrationKey]);

  useEffect(() => {
    setBlockedManagedWindowIds((current) => {
      const next: Record<string, true> = {};
      let changed = false;
      for (const instanceId of Object.keys(current)) {
        const window = localWindowsById[instanceId];
        if (
          window &&
          windowSurfaceRequiresManagedChat(window, managedChatAuthorityState)
        ) {
          next[instanceId] = true;
          continue;
        }
        changed = true;
      }
      if (
        !changed &&
        Object.keys(current).length === Object.keys(next).length
      ) {
        return current;
      }
      return next;
    });
  }, [localWindowsById, managedChatAuthorityState]);

  useEffect(() => {
    if (!previousCanUseManagedChatRef.current && canUseManagedChat) {
      setBlockedManagedWindowIds((current) => {
        if (Object.keys(current).length === 0) {
          return current;
        }
        return {};
      });
    }
    previousCanUseManagedChatRef.current = canUseManagedChat;
  }, [canUseManagedChat]);

  const visibleWindows = useMemo(() => {
    return Object.values(localWindowsById)
      .filter((window) => {
        if (
          !canUseManagedChat &&
          windowSurfaceRequiresManagedChat(window, managedChatAuthorityState)
        ) {
          return false;
        }
        return !blockedManagedWindowIds[window.instanceId];
      })
      .sort((a, b) => {
        if (a.zIndex !== b.zIndex) {
          return a.zIndex - b.zIndex;
        }
        return a.instanceId.localeCompare(b.instanceId);
      });
  }, [
    blockedManagedWindowIds,
    canUseManagedChat,
    localWindowsById,
    managedChatAuthorityState,
  ]);
  const hasManagedWindows = useMemo(() => {
    return Object.values(localWindowsById).some((window) =>
      windowSurfaceRequiresManagedChat(window, managedChatAuthorityState),
    );
  }, [localWindowsById, managedChatAuthorityState]);
  const shouldShowManagedChatBlockedSurface =
    visibleWindows.length === 0 && hasManagedWindows;

  const snappedWindows = useMemo(() => {
    return visibleWindows.flatMap((window) => {
      const snapPreset = resolveFloatingSnapPresetFromBounds(
        window.bounds,
        viewportSize.width,
        viewportSize.height,
        {
          left: 0,
          right: 0,
          top: 0,
          bottom: 0,
        },
      );
      if (!snapPreset) {
        return [];
      }
      return [
        {
          instanceId: window.instanceId,
          bounds: window.bounds,
          snapPreset,
        } satisfies SnappedStandaloneWindow,
      ];
    });
  }, [viewportSize.height, viewportSize.width, visibleWindows]);
  const snapResizeHandles = useMemo(
    () => buildFloatingSnapResizeHandles(snappedWindows),
    [snappedWindows],
  );

  function focusWindow(instanceId: string) {
    setLocalWindowsById((current) =>
      focusStandaloneWindow(current, instanceId),
    );
  }

  function setProjectChatWindowChatId(
    instanceId: string,
    chatId: string | null | undefined,
  ) {
    setLocalWindowsById((current) =>
      setStandaloneProjectChatWindowChatId(current, instanceId, chatId),
    );
  }

  function setEmbeddedGitPaneVisible(instanceId: string, visible: boolean) {
    setLocalWindowsById((current) =>
      setStandaloneEmbeddedGitPaneVisibility(current, instanceId, visible),
    );
  }

  function setWindowBlockedErrorCode(
    instanceId: string,
    errorCode: string | null,
  ) {
    setBlockedManagedWindowIds((current) => {
      const shouldBlock = errorCode === "llm_disallowed";
      if (shouldBlock) {
        if (current[instanceId]) {
          return current;
        }
        return {
          ...current,
          [instanceId]: true,
        };
      }
      if (!current[instanceId]) {
        return current;
      }
      const next = { ...current };
      delete next[instanceId];
      return next;
    });
  }

  function onSnapResizePointerDown(
    event: PointerEvent<HTMLDivElement>,
    handle: FloatingSnapResizeHandle,
  ) {
    if (event.button !== 0) {
      return;
    }
    const startBoundsByInstanceId: Record<string, ChatWindowBounds> = {};
    const involvedInstanceIds = [
      ...handle.leadingInstanceIds,
      ...handle.trailingInstanceIds,
    ];
    for (const instanceId of involvedInstanceIds) {
      const bounds = localWindowsById[instanceId]?.bounds;
      if (!bounds) {
        return;
      }
      startBoundsByInstanceId[instanceId] = { ...bounds };
    }

    if (handle.axis === "vertical") {
      let minCoordinate = -Infinity;
      let maxCoordinate = Infinity;
      for (const instanceId of handle.leadingInstanceIds) {
        const bounds = startBoundsByInstanceId[instanceId];
        if (!bounds) {
          return;
        }
        minCoordinate = Math.max(
          minCoordinate,
          bounds.x + STANDALONE_WINDOW_SPACE_MIN_WIDTH_PX,
        );
      }
      for (const instanceId of handle.trailingInstanceIds) {
        const bounds = startBoundsByInstanceId[instanceId];
        if (!bounds) {
          return;
        }
        maxCoordinate = Math.min(
          maxCoordinate,
          bounds.x + bounds.width - STANDALONE_WINDOW_SPACE_MIN_WIDTH_PX,
        );
      }
      activeSnapResizeRef.current = {
        pointerId: event.pointerId,
        axis: "vertical",
        startPointerPosition: event.clientX,
        startCoordinate: handle.coordinate,
        minCoordinate,
        maxCoordinate,
        leadingInstanceIds: handle.leadingInstanceIds,
        trailingInstanceIds: handle.trailingInstanceIds,
        startBoundsByInstanceId,
      };
    } else {
      let minCoordinate = -Infinity;
      let maxCoordinate = Infinity;
      for (const instanceId of handle.leadingInstanceIds) {
        const bounds = startBoundsByInstanceId[instanceId];
        if (!bounds) {
          return;
        }
        minCoordinate = Math.max(
          minCoordinate,
          bounds.y + STANDALONE_WINDOW_SPACE_MIN_HEIGHT_PX,
        );
      }
      for (const instanceId of handle.trailingInstanceIds) {
        const bounds = startBoundsByInstanceId[instanceId];
        if (!bounds) {
          return;
        }
        maxCoordinate = Math.min(
          maxCoordinate,
          bounds.y + bounds.height - STANDALONE_WINDOW_SPACE_MIN_HEIGHT_PX,
        );
      }
      activeSnapResizeRef.current = {
        pointerId: event.pointerId,
        axis: "horizontal",
        startPointerPosition: event.clientY,
        startCoordinate: handle.coordinate,
        minCoordinate,
        maxCoordinate,
        leadingInstanceIds: handle.leadingInstanceIds,
        trailingInstanceIds: handle.trailingInstanceIds,
        startBoundsByInstanceId,
      };
    }
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onSnapResizePointerMove(event: PointerEvent<HTMLDivElement>) {
    const activeResize = activeSnapResizeRef.current;
    if (!activeResize || activeResize.pointerId !== event.pointerId) {
      return;
    }
    const pointerPosition =
      activeResize.axis === "vertical" ? event.clientX : event.clientY;
    const unclampedCoordinate =
      activeResize.startCoordinate +
      (pointerPosition - activeResize.startPointerPosition);
    const nextCoordinate = Math.min(
      Math.max(unclampedCoordinate, activeResize.minCoordinate),
      activeResize.maxCoordinate,
    );
    const nextBoundsByInstanceId = buildFloatingSnapResizeBounds(
      {
        axis: activeResize.axis,
        coordinate: activeResize.startCoordinate,
        leadingInstanceIds: activeResize.leadingInstanceIds,
        trailingInstanceIds: activeResize.trailingInstanceIds,
        startBoundsByInstanceId: activeResize.startBoundsByInstanceId,
      },
      nextCoordinate,
    );
    setLocalWindowsById((current) =>
      updateStandaloneWindowBounds(current, nextBoundsByInstanceId),
    );
  }

  function onSnapResizePointerUp(event: PointerEvent<HTMLDivElement>) {
    const activeResize = activeSnapResizeRef.current;
    if (!activeResize || activeResize.pointerId !== event.pointerId) {
      return;
    }
    activeSnapResizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return {
    focusWindow,
    onSnapResizePointerDown,
    onSnapResizePointerMove,
    onSnapResizePointerUp,
    setEmbeddedGitPaneVisible,
    setProjectChatWindowChatId,
    setWindowBlockedErrorCode,
    shouldShowManagedChatBlockedSurface,
    snapResizeHandles,
    visibleWindows,
  };
}
