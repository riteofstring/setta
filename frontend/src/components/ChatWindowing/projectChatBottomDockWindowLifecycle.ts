import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { bootProjectChatWindowToCanvasSection } from "state/actions/projectChatWindowingCanvasBoot";
import { clearTrackedGitPaneGraphWindowIfMatches } from "state/actions/projectChatWindowingTrackedGitPaneState";
import { setProjectChatWindowPlacement } from "state/actions/projectChatWindowLayoutCommands";
import {
  closeProjectChatWindow,
  createProjectChatWindowInstance,
  focusProjectChatWindow,
  maximizeProjectChatWindow,
  minimizeProjectChatWindow,
  reopenProjectChatWindow,
  unmaximizeProjectChatWindow,
} from "state/actions/projectChatWindowLifecycleCommands";
import { setProjectChatWindowTitle } from "state/actions/projectChatWindowMetadataCommands";
import {
  ChatWindowPlacementEnum,
  type ProjectChatWindowInstance,
} from "utils/generatedTypes";

import { type ChatWindowPillExitAnimationKind } from "./projectChatBottomDockPillStrip";
import type {
  ChatWindowEnterAnimationKind,
  ChatWindowExitAnimationKind,
  ResolvedWindowPill,
} from "./projectChatBottomDockTypes";

const CHAT_WINDOW_ENTER_ANIMATION_PRIME_DELAY_MS = 16;
const CHAT_WINDOW_ENTER_DURATION_MS = 110;
const CHAT_WINDOW_PILL_EXIT_DURATION_MS = 72;
const CHAT_WINDOW_MINIMIZE_EXIT_DURATION_MS = 115;
const CHAT_WINDOW_CLOSE_EXIT_DURATION_MS = 125;

function clampNumber(
  value: number,
  minValue: number,
  maxValue: number,
): number {
  if (value < minValue) {
    return minValue;
  }
  if (value > maxValue) {
    return maxValue;
  }
  return value;
}

export function resolveNextVisibleWindowFocusTarget(args: {
  closingInstanceId: string;
  orderedPills: ResolvedWindowPill[];
}): string | null {
  const { closingInstanceId, orderedPills } = args;
  for (const candidatePill of orderedPills) {
    if (candidatePill.instanceId === closingInstanceId) {
      continue;
    }
    if (candidatePill.isClosed || candidatePill.isMinimized) {
      continue;
    }
    return candidatePill.instanceId;
  }
  return null;
}

export function resolveDockCycleOffsetForOpenedWindow(args: {
  dockVisibleStartIndex: number;
  instanceId: string;
  instanceIsMinimized: boolean;
  instancePlacement: ProjectChatWindowInstance["placement"];
  maxVisibleDockedCount: number;
  openDockedPillsCount: number;
  orderedPills: ResolvedWindowPill[];
}): number | null {
  const {
    dockVisibleStartIndex,
    instanceId,
    instanceIsMinimized,
    instancePlacement,
    maxVisibleDockedCount,
    openDockedPillsCount,
    orderedPills,
  } = args;

  if (
    instancePlacement !== ChatWindowPlacementEnum.bottom_docked ||
    maxVisibleDockedCount <= 0
  ) {
    return null;
  }

  let targetDockIndex = 0;
  let foundTarget = false;
  for (const pill of orderedPills) {
    if (
      pill.isClosed ||
      pill.placement !== ChatWindowPlacementEnum.bottom_docked
    ) {
      continue;
    }
    if (pill.isMinimized && pill.instanceId !== instanceId) {
      continue;
    }
    if (pill.instanceId === instanceId) {
      foundTarget = true;
      break;
    }
    targetDockIndex += 1;
  }
  if (!foundTarget) {
    return null;
  }

  const currentEndIndex = dockVisibleStartIndex + maxVisibleDockedCount;
  let nextStartIndex = dockVisibleStartIndex;
  if (targetDockIndex < dockVisibleStartIndex) {
    nextStartIndex = targetDockIndex;
  } else if (targetDockIndex >= currentEndIndex) {
    nextStartIndex = targetDockIndex - maxVisibleDockedCount + 1;
  }
  const nextTotalDockCount =
    openDockedPillsCount + (instanceIsMinimized ? 1 : 0);
  const nextMaxStartIndex = Math.max(
    0,
    nextTotalDockCount - maxVisibleDockedCount,
  );
  return nextMaxStartIndex - clampNumber(nextStartIndex, 0, nextMaxStartIndex);
}

type UseProjectChatBottomDockWindowLifecycleArgs = {
  canCreateManagedChatWindow: boolean;
  dockCycleOffsetFromEnd: number;
  dockVisibleStartIndex: number;
  instancesById: Record<string, ProjectChatWindowInstance>;
  maxDockCycleOffset: number;
  maxVisibleDockedCount: number;
  openDockedPills: ResolvedWindowPill[];
  orderedPills: ResolvedWindowPill[];
  projectConfigId: string;
  setDockCycleOffsetFromEnd: Dispatch<SetStateAction<number>>;
  setIsCanvasVisibilitySuppressed: Dispatch<SetStateAction<boolean>>;
};

type UseProjectChatBottomDockWindowLifecycleResult = {
  handleCloseWindow: (instanceId: string) => void;
  handleCreate: () => void;
  handleCycleDockWindowsBackward: () => void;
  handleCycleDockWindowsForward: () => void;
  handleDockWindow: (instanceId: string) => void;
  handleFocusWindow: (instanceId: string) => void;
  handleMaximizeWindow: (instanceId: string) => void;
  handleMinimizeWindow: (instanceId: string) => void;
  handleOpenWindow: (instanceId: string, source: "pill" | "menu") => void;
  handleRestoreWindow: (instanceId: string) => void;
  handleSetWindowTitle: (instanceId: string, nextTitle: string) => void;
  handleShowInCanvas: (instanceId: string) => void;
  handleUndockWindow: (instanceId: string) => void;
  pillExitAnimationsById: Record<string, ChatWindowPillExitAnimationKind>;
  windowEnterAnimationPrimesById: Record<string, ChatWindowEnterAnimationKind>;
  windowEnterAnimationsById: Record<string, ChatWindowEnterAnimationKind>;
  windowExitAnimationsById: Record<string, ChatWindowExitAnimationKind>;
};

export function useProjectChatBottomDockWindowLifecycle({
  canCreateManagedChatWindow,
  dockCycleOffsetFromEnd,
  dockVisibleStartIndex,
  instancesById,
  maxDockCycleOffset,
  maxVisibleDockedCount,
  openDockedPills,
  orderedPills,
  projectConfigId,
  setDockCycleOffsetFromEnd,
  setIsCanvasVisibilitySuppressed,
}: UseProjectChatBottomDockWindowLifecycleArgs): UseProjectChatBottomDockWindowLifecycleResult {
  const [windowExitAnimationsById, setWindowExitAnimationsById] = useState<
    Record<string, ChatWindowExitAnimationKind>
  >({});
  const [windowEnterAnimationsById, setWindowEnterAnimationsById] = useState<
    Record<string, ChatWindowEnterAnimationKind>
  >({});
  const [pillExitAnimationsById, setPillExitAnimationsById] = useState<
    Record<string, ChatWindowPillExitAnimationKind>
  >({});
  const [windowEnterAnimationPrimesById, setWindowEnterAnimationPrimesById] =
    useState<Record<string, ChatWindowEnterAnimationKind>>({});
  const windowExitTimeoutsRef = useRef<Record<string, number>>({});
  const pillExitTimeoutsRef = useRef<Record<string, number>>({});
  const windowEnterPrimeTimeoutsRef = useRef<Record<string, number>>({});
  const windowEnterAnimationTimeoutsRef = useRef<Record<string, number>>({});

  useEffect(() => {
    return () => {
      for (const timeoutId of Object.values(windowExitTimeoutsRef.current)) {
        window.clearTimeout(timeoutId);
      }
      windowExitTimeoutsRef.current = {};
      for (const timeoutId of Object.values(pillExitTimeoutsRef.current)) {
        window.clearTimeout(timeoutId);
      }
      pillExitTimeoutsRef.current = {};
      for (const timeoutId of Object.values(
        windowEnterPrimeTimeoutsRef.current,
      )) {
        window.clearTimeout(timeoutId);
      }
      windowEnterPrimeTimeoutsRef.current = {};
      for (const timeoutId of Object.values(
        windowEnterAnimationTimeoutsRef.current,
      )) {
        window.clearTimeout(timeoutId);
      }
      windowEnterAnimationTimeoutsRef.current = {};
    };
  }, []);

  const handleCreate = useCallback(() => {
    if (!canCreateManagedChatWindow) {
      return;
    }
    const instanceId = createProjectChatWindowInstance();
    if (!instanceId) {
      return;
    }
    focusProjectChatWindow(instanceId);
    setIsCanvasVisibilitySuppressed(false);
  }, [canCreateManagedChatWindow, setIsCanvasVisibilitySuppressed]);

  const clearWindowExitAnimation = useCallback((instanceId: string) => {
    const activeTimeoutId = windowExitTimeoutsRef.current[instanceId];
    if (activeTimeoutId !== undefined) {
      window.clearTimeout(activeTimeoutId);
      delete windowExitTimeoutsRef.current[instanceId];
    }
    setWindowExitAnimationsById((current) => {
      if (!(instanceId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[instanceId];
      return next;
    });
  }, []);

  const clearWindowEnterAnimation = useCallback((instanceId: string) => {
    const activePrimeTimeoutId =
      windowEnterPrimeTimeoutsRef.current[instanceId];
    if (activePrimeTimeoutId !== undefined) {
      window.clearTimeout(activePrimeTimeoutId);
      delete windowEnterPrimeTimeoutsRef.current[instanceId];
    }
    const activeAnimationTimeoutId =
      windowEnterAnimationTimeoutsRef.current[instanceId];
    if (activeAnimationTimeoutId !== undefined) {
      window.clearTimeout(activeAnimationTimeoutId);
      delete windowEnterAnimationTimeoutsRef.current[instanceId];
    }
    setWindowEnterAnimationsById((current) => {
      if (!(instanceId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[instanceId];
      return next;
    });
    setWindowEnterAnimationPrimesById((current) => {
      if (!(instanceId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[instanceId];
      return next;
    });
  }, []);

  const clearPillExitAnimation = useCallback((instanceId: string) => {
    const activeTimeoutId = pillExitTimeoutsRef.current[instanceId];
    if (activeTimeoutId !== undefined) {
      window.clearTimeout(activeTimeoutId);
      delete pillExitTimeoutsRef.current[instanceId];
    }
    setPillExitAnimationsById((current) => {
      if (!(instanceId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[instanceId];
      return next;
    });
  }, []);

  const startWindowEnterAnimation = useCallback(
    (instanceId: string, kind: ChatWindowEnterAnimationKind) => {
      setWindowEnterAnimationsById((current) => {
        if (current[instanceId] === kind) {
          return current;
        }
        return {
          ...current,
          [instanceId]: kind,
        };
      });
      setWindowEnterAnimationPrimesById((current) => {
        if (current[instanceId] === kind) {
          return current;
        }
        return {
          ...current,
          [instanceId]: kind,
        };
      });
      const activePrimeTimeoutId =
        windowEnterPrimeTimeoutsRef.current[instanceId];
      if (activePrimeTimeoutId !== undefined) {
        window.clearTimeout(activePrimeTimeoutId);
      }
      const activeAnimationTimeoutId =
        windowEnterAnimationTimeoutsRef.current[instanceId];
      if (activeAnimationTimeoutId !== undefined) {
        window.clearTimeout(activeAnimationTimeoutId);
      }
      windowEnterPrimeTimeoutsRef.current[instanceId] = window.setTimeout(
        () => {
          delete windowEnterPrimeTimeoutsRef.current[instanceId];
          setWindowEnterAnimationPrimesById((current) => {
            if (!(instanceId in current)) {
              return current;
            }
            const next = { ...current };
            delete next[instanceId];
            return next;
          });
        },
        CHAT_WINDOW_ENTER_ANIMATION_PRIME_DELAY_MS,
      );
      windowEnterAnimationTimeoutsRef.current[instanceId] = window.setTimeout(
        () => {
          delete windowEnterAnimationTimeoutsRef.current[instanceId];
          setWindowEnterAnimationsById((current) => {
            if (!(instanceId in current)) {
              return current;
            }
            const next = { ...current };
            delete next[instanceId];
            return next;
          });
        },
        CHAT_WINDOW_ENTER_DURATION_MS,
      );
    },
    [],
  );

  const startPillExitAnimation = useCallback(
    (
      instanceId: string,
      kind: ChatWindowPillExitAnimationKind,
      onComplete: () => void,
    ) => {
      setPillExitAnimationsById((current) => {
        if (current[instanceId] === kind) {
          return current;
        }
        return {
          ...current,
          [instanceId]: kind,
        };
      });
      const activeTimeoutId = pillExitTimeoutsRef.current[instanceId];
      if (activeTimeoutId !== undefined) {
        window.clearTimeout(activeTimeoutId);
      }
      pillExitTimeoutsRef.current[instanceId] = window.setTimeout(() => {
        delete pillExitTimeoutsRef.current[instanceId];
        setPillExitAnimationsById((current) => {
          if (!(instanceId in current)) {
            return current;
          }
          const next = { ...current };
          delete next[instanceId];
          return next;
        });
        onComplete();
      }, CHAT_WINDOW_PILL_EXIT_DURATION_MS);
    },
    [],
  );

  const startWindowExitAnimation = useCallback(
    (
      instanceId: string,
      kind: ChatWindowExitAnimationKind,
      { focusAfterClose = false }: { focusAfterClose?: boolean } = {},
    ) => {
      if (!instancesById[instanceId]) {
        return;
      }
      clearTrackedGitPaneGraphWindowIfMatches(projectConfigId, instanceId);
      clearWindowEnterAnimation(instanceId);
      setWindowExitAnimationsById((current) => {
        if (current[instanceId] === kind) {
          return current;
        }
        return {
          ...current,
          [instanceId]: kind,
        };
      });
      const activeTimeoutId = windowExitTimeoutsRef.current[instanceId];
      if (activeTimeoutId !== undefined) {
        window.clearTimeout(activeTimeoutId);
      }
      const durationMs =
        kind === "minimize"
          ? CHAT_WINDOW_MINIMIZE_EXIT_DURATION_MS
          : CHAT_WINDOW_CLOSE_EXIT_DURATION_MS;
      windowExitTimeoutsRef.current[instanceId] = window.setTimeout(() => {
        delete windowExitTimeoutsRef.current[instanceId];
        if (kind === "minimize") {
          minimizeProjectChatWindow(instanceId);
        } else {
          closeProjectChatWindow(instanceId);
        }
        setWindowExitAnimationsById((current) => {
          if (!(instanceId in current)) {
            return current;
          }
          const next = { ...current };
          delete next[instanceId];
          return next;
        });
        if (focusAfterClose) {
          const nextVisibleWindowId = resolveNextVisibleWindowFocusTarget({
            closingInstanceId: instanceId,
            orderedPills,
          });
          if (nextVisibleWindowId) {
            focusProjectChatWindow(nextVisibleWindowId);
          }
        }
      }, durationMs);
    },
    [clearWindowEnterAnimation, instancesById, orderedPills, projectConfigId],
  );

  const handleOpenWindow = useCallback(
    (instanceId: string, source: "pill" | "menu") => {
      const instance = instancesById[instanceId];
      if (!instance) {
        return;
      }
      const nextDockCycleOffsetFromEnd = resolveDockCycleOffsetForOpenedWindow({
        dockVisibleStartIndex,
        instanceId,
        instanceIsMinimized: instance.isMinimized,
        instancePlacement: instance.placement,
        maxVisibleDockedCount,
        openDockedPillsCount: openDockedPills.length,
        orderedPills,
      });
      if (nextDockCycleOffsetFromEnd !== null) {
        setDockCycleOffsetFromEnd(nextDockCycleOffsetFromEnd);
      }
      clearWindowExitAnimation(instanceId);
      clearWindowEnterAnimation(instanceId);
      clearPillExitAnimation(instanceId);
      if (instance.isMinimized && source === "pill") {
        startPillExitAnimation(instanceId, "restore_from_minimize", () => {
          startWindowEnterAnimation(instanceId, "restore_from_minimize");
          reopenProjectChatWindow(instanceId);
          focusProjectChatWindow(instanceId);
          setIsCanvasVisibilitySuppressed(false);
        });
        return;
      }
      if (instance.isClosed || instance.isMinimized) {
        startWindowEnterAnimation(instanceId, "restore_from_minimize");
      }
      reopenProjectChatWindow(instanceId);
      focusProjectChatWindow(instanceId);
      setIsCanvasVisibilitySuppressed(false);
    },
    [
      clearPillExitAnimation,
      clearWindowEnterAnimation,
      clearWindowExitAnimation,
      dockVisibleStartIndex,
      instancesById,
      maxVisibleDockedCount,
      openDockedPills.length,
      orderedPills,
      setDockCycleOffsetFromEnd,
      setIsCanvasVisibilitySuppressed,
      startPillExitAnimation,
      startWindowEnterAnimation,
    ],
  );

  const handleMinimizeWindow = useCallback(
    (instanceId: string) => {
      startWindowExitAnimation(instanceId, "minimize", {
        focusAfterClose: true,
      });
    },
    [startWindowExitAnimation],
  );

  const handleCloseWindow = useCallback(
    (instanceId: string) => {
      startWindowExitAnimation(instanceId, "close", { focusAfterClose: true });
    },
    [startWindowExitAnimation],
  );

  const handleFocusWindow = useCallback((instanceId: string) => {
    focusProjectChatWindow(instanceId);
  }, []);

  const handleCycleDockWindowsBackward = useCallback(() => {
    if (dockVisibleStartIndex <= 0 || maxVisibleDockedCount === 0) {
      return;
    }
    const nextStartIndex = dockVisibleStartIndex - 1;
    const focusTargetId = openDockedPills[nextStartIndex]?.instanceId;
    setDockCycleOffsetFromEnd((current) =>
      clampNumber(current + 1, 0, maxDockCycleOffset),
    );
    if (focusTargetId) {
      focusProjectChatWindow(focusTargetId);
    }
  }, [
    dockVisibleStartIndex,
    maxDockCycleOffset,
    maxVisibleDockedCount,
    openDockedPills,
    setDockCycleOffsetFromEnd,
  ]);

  const handleCycleDockWindowsForward = useCallback(() => {
    if (dockCycleOffsetFromEnd <= 0 || maxVisibleDockedCount === 0) {
      return;
    }
    const nextStartIndex = dockVisibleStartIndex + 1;
    const focusTargetId =
      openDockedPills[nextStartIndex + maxVisibleDockedCount - 1]?.instanceId;
    setDockCycleOffsetFromEnd((current) => Math.max(0, current - 1));
    if (focusTargetId) {
      focusProjectChatWindow(focusTargetId);
    }
  }, [
    dockCycleOffsetFromEnd,
    dockVisibleStartIndex,
    maxVisibleDockedCount,
    openDockedPills,
    setDockCycleOffsetFromEnd,
  ]);

  const handleSetWindowTitle = useCallback(
    (instanceId: string, nextTitle: string) => {
      setProjectChatWindowTitle(instanceId, nextTitle);
    },
    [],
  );

  const handleUndockWindow = useCallback(
    (instanceId: string) => {
      clearWindowExitAnimation(instanceId);
      setProjectChatWindowPlacement(
        instanceId,
        ChatWindowPlacementEnum.floating,
      );
      focusProjectChatWindow(instanceId);
      setIsCanvasVisibilitySuppressed(false);
    },
    [clearWindowExitAnimation, setIsCanvasVisibilitySuppressed],
  );

  const handleDockWindow = useCallback(
    (instanceId: string) => {
      clearWindowExitAnimation(instanceId);
      setProjectChatWindowPlacement(
        instanceId,
        ChatWindowPlacementEnum.bottom_docked,
      );
      focusProjectChatWindow(instanceId);
      setIsCanvasVisibilitySuppressed(false);
    },
    [clearWindowExitAnimation, setIsCanvasVisibilitySuppressed],
  );

  const handleMaximizeWindow = useCallback(
    (instanceId: string) => {
      clearWindowExitAnimation(instanceId);
      maximizeProjectChatWindow(instanceId);
      focusProjectChatWindow(instanceId);
      setIsCanvasVisibilitySuppressed(false);
    },
    [clearWindowExitAnimation, setIsCanvasVisibilitySuppressed],
  );

  const handleRestoreWindow = useCallback(
    (instanceId: string) => {
      clearWindowExitAnimation(instanceId);
      unmaximizeProjectChatWindow(instanceId);
      focusProjectChatWindow(instanceId);
      setIsCanvasVisibilitySuppressed(false);
    },
    [clearWindowExitAnimation, setIsCanvasVisibilitySuppressed],
  );

  const handleShowInCanvas = useCallback((instanceId: string) => {
    void bootProjectChatWindowToCanvasSection(instanceId);
  }, []);

  return {
    handleCloseWindow,
    handleCreate,
    handleCycleDockWindowsBackward,
    handleCycleDockWindowsForward,
    handleDockWindow,
    handleFocusWindow,
    handleMaximizeWindow,
    handleMinimizeWindow,
    handleOpenWindow,
    handleRestoreWindow,
    handleSetWindowTitle,
    handleShowInCanvas,
    handleUndockWindow,
    pillExitAnimationsById,
    windowEnterAnimationPrimesById,
    windowEnterAnimationsById,
    windowExitAnimationsById,
  };
}
