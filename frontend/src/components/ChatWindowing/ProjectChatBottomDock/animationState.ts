import { useCallback, useEffect, useRef, useState } from "react";
import {
  clearTrackedGitPaneGraphWindowIfMatches,
  closeProjectChatWindow,
  focusProjectChatWindow,
  minimizeProjectChatWindow,
} from "state/actions/projectChatWindowing";

import {
  CHAT_WINDOW_CLOSE_EXIT_DURATION_MS,
  CHAT_WINDOW_ENTER_ANIMATION_PRIME_DELAY_MS,
  CHAT_WINDOW_ENTER_DURATION_MS,
  CHAT_WINDOW_MINIMIZE_EXIT_DURATION_MS,
  CHAT_WINDOW_PILL_EXIT_DURATION_MS,
  type ChatWindowEnterAnimationKind,
  type ChatWindowExitAnimationKind,
  type ChatWindowPillExitAnimationKind,
  ResolvedWindowPill,
} from "./shared";

export function useProjectChatWindowAnimationState({
  instancesById,
  orderedPills,
  projectConfigId,
}: {
  instancesById: Record<string, unknown>;
  orderedPills: ResolvedWindowPill[];
  projectConfigId: string;
}) {
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
    setWindowEnterAnimationPrimesById((current) => {
      if (!(instanceId in current)) {
        return current;
      }
      const next = { ...current };
      delete next[instanceId];
      return next;
    });
    setWindowEnterAnimationsById((current) => {
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
      clearWindowEnterAnimation(instanceId);
      setWindowEnterAnimationPrimesById((current) => {
        if (current[instanceId] === kind) {
          return current;
        }
        return {
          ...current,
          [instanceId]: kind,
        };
      });
      windowEnterPrimeTimeoutsRef.current[instanceId] = window.setTimeout(
        () => {
          delete windowEnterPrimeTimeoutsRef.current[instanceId];
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
        CHAT_WINDOW_ENTER_ANIMATION_PRIME_DELAY_MS +
          CHAT_WINDOW_ENTER_DURATION_MS,
      );
    },
    [clearWindowEnterAnimation],
  );

  const startPillExitAnimation = useCallback(
    (
      instanceId: string,
      kind: ChatWindowPillExitAnimationKind,
      onComplete: () => void,
    ) => {
      clearPillExitAnimation(instanceId);
      setPillExitAnimationsById((current) => {
        if (current[instanceId] === kind) {
          return current;
        }
        return {
          ...current,
          [instanceId]: kind,
        };
      });
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
    [clearPillExitAnimation],
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
      clearWindowEnterAnimation(instanceId);
      clearWindowExitAnimation(instanceId);
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
          clearTrackedGitPaneGraphWindowIfMatches(projectConfigId, instanceId);
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
          const nextVisibleWindowId = orderedPills.find(
            (candidatePill) =>
              candidatePill.instanceId !== instanceId &&
              !candidatePill.isClosed &&
              !candidatePill.isMinimized,
          );
          if (nextVisibleWindowId) {
            focusProjectChatWindow(nextVisibleWindowId.instanceId);
          }
        }
      }, durationMs);
    },
    [
      clearWindowEnterAnimation,
      clearWindowExitAnimation,
      instancesById,
      orderedPills,
      projectConfigId,
    ],
  );

  return {
    windowExitAnimationsById,
    windowEnterAnimationsById,
    pillExitAnimationsById,
    windowEnterAnimationPrimesById,
    clearWindowExitAnimation,
    clearWindowEnterAnimation,
    clearPillExitAnimation,
    startWindowEnterAnimation,
    startPillExitAnimation,
    startWindowExitAnimation,
  };
}
