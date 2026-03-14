import {
  CHAT_STARTER_PROMPTS,
  type ChatStarterPrompt,
} from "components/Chat/chatComposerControls";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  route_get_file_browser_root,
  route_get_folder_contents,
} from "utils/generatedEndpoints";
import { resolveWorkspaceRootPollDelayMs } from "./projectChatRuntimeUtils";
import { buildCreateProjectStarterPrompt } from "./projectChatStarterPrompts";
import {
  getCachedWorkspacePythonSignal,
  hasPythonSignalsInRoot,
  setCachedWorkspacePythonSignal,
  type WorkspacePythonSignalCache,
} from "./workspacePythonSignals";

const hasPythonInWorkspaceRootCache: WorkspacePythonSignalCache = new Map();
const WORKSPACE_PYTHON_SIGNAL_REVALIDATE_MS = 5000;

function useWorkspaceRootIdentity(
  enabled: boolean,
  projectConfigId: string,
): string | null {
  const [workspaceRootIdentity, setWorkspaceRootIdentity] = useState<
    string | null
  >(null);

  useEffect(() => {
    if (!enabled) {
      setWorkspaceRootIdentity(null);
      return;
    }
    setWorkspaceRootIdentity(null);
    let cancelled = false;
    let inFlight = false;
    let stablePollCount = 0;
    let lastResolvedRoot: string | null = null;
    let timeoutId: number | null = null;

    const clearScheduledPoll = () => {
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
        timeoutId = null;
      }
    };

    const scheduleNextPoll = () => {
      if (cancelled || document.visibilityState !== "visible") {
        return;
      }
      const delay = resolveWorkspaceRootPollDelayMs(stablePollCount);
      clearScheduledPoll();
      timeoutId = window.setTimeout(() => {
        void refreshRootIdentity();
      }, delay);
    };

    const refreshRootIdentity = async () => {
      if (cancelled || inFlight) {
        return;
      }
      inFlight = true;
      try {
        const rootResponse = await route_get_file_browser_root();
        if (cancelled) {
          return;
        }
        if (
          !rootResponse ||
          rootResponse.status !== 200 ||
          !rootResponse.data
        ) {
          stablePollCount = 0;
          return;
        }
        let nextRoot: string | null = null;
        const rootPath = rootResponse.data.rootPath.trim();
        if (rootPath) {
          nextRoot = rootPath;
        }
        if (nextRoot === lastResolvedRoot) {
          stablePollCount += 1;
        } else {
          lastResolvedRoot = nextRoot;
          stablePollCount = 0;
        }
        setWorkspaceRootIdentity((current) => {
          if (current === nextRoot) {
            return current;
          }
          return nextRoot;
        });
      } catch {
        stablePollCount = 0;
      } finally {
        inFlight = false;
        scheduleNextPoll();
      }
    };

    const handleVisibilityChange = () => {
      if (cancelled) {
        return;
      }
      if (document.visibilityState !== "visible") {
        clearScheduledPoll();
        return;
      }
      void refreshRootIdentity();
    };

    void refreshRootIdentity();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      cancelled = true;
      clearScheduledPoll();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, projectConfigId]);

  return workspaceRootIdentity;
}

function useHasPythonInWorkspaceRoot(
  enabled: boolean,
  workspaceRootIdentity: string | null,
): boolean {
  const [hasPython, setHasPython] = useState(false);
  const [revalidationTick, setRevalidationTick] = useState(0);
  const previousRootRef = useRef<string | null>(null);
  const inFlightRootScanRef = useRef<Promise<void> | null>(null);
  const pendingRootIdentityRef = useRef<string | null>(null);

  useEffect(() => {
    if (workspaceRootIdentity === previousRootRef.current) {
      return;
    }
    previousRootRef.current = workspaceRootIdentity;
    setHasPython(false);
  }, [workspaceRootIdentity]);

  useEffect(() => {
    if (!enabled || !workspaceRootIdentity) {
      return;
    }
    let intervalId: number | null = null;

    const clearRevalidationInterval = () => {
      if (intervalId === null) {
        return;
      }
      window.clearInterval(intervalId);
      intervalId = null;
    };

    const startRevalidationInterval = () => {
      clearRevalidationInterval();
      if (document.visibilityState !== "visible") {
        return;
      }
      intervalId = window.setInterval(() => {
        setRevalidationTick((current) => current + 1);
      }, WORKSPACE_PYTHON_SIGNAL_REVALIDATE_MS);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState !== "visible") {
        clearRevalidationInterval();
        return;
      }
      setRevalidationTick((current) => current + 1);
      startRevalidationInterval();
    };

    startRevalidationInterval();
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      clearRevalidationInterval();
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [enabled, workspaceRootIdentity]);

  useEffect(() => {
    if (!enabled || !workspaceRootIdentity) {
      pendingRootIdentityRef.current = null;
      setHasPython(false);
      return;
    }
    if (inFlightRootScanRef.current !== null) {
      pendingRootIdentityRef.current = workspaceRootIdentity;
      return;
    }
    let cancelled = false;
    const scannedRootIdentity = workspaceRootIdentity;

    const load = async () => {
      const rootPath = scannedRootIdentity;
      pendingRootIdentityRef.current = null;
      const shouldUseCache = revalidationTick === 0;
      if (shouldUseCache) {
        const cached = getCachedWorkspacePythonSignal(
          hasPythonInWorkspaceRootCache,
          rootPath,
        );
        if (cached !== null) {
          if (cancelled) {
            return;
          }
          setHasPython(cached);
          return;
        }
      }
      try {
        const contentsResponse = await route_get_folder_contents({
          folderPath: rootPath,
          includeHidden: false,
          includeMtime: false,
          includeSize: false,
          maxEntries: 5000,
        });
        if (
          !contentsResponse ||
          contentsResponse.status !== 200 ||
          !Array.isArray(contentsResponse.data)
        ) {
          if (!cancelled) {
            setHasPython(false);
          }
          return;
        }
        if (cancelled) {
          return;
        }
        const hasPythonSignals = hasPythonSignalsInRoot(contentsResponse.data);
        setCachedWorkspacePythonSignal(
          hasPythonInWorkspaceRootCache,
          rootPath,
          hasPythonSignals,
        );
        setHasPython(hasPythonSignals);
      } catch {
        if (!cancelled) {
          setHasPython(false);
        }
      }
    };

    const loadPromise = load().finally(() => {
      if (inFlightRootScanRef.current === loadPromise) {
        inFlightRootScanRef.current = null;
      }
      const pendingRootIdentity = pendingRootIdentityRef.current;
      if (pendingRootIdentity && pendingRootIdentity !== scannedRootIdentity) {
        setRevalidationTick((current) => current + 1);
      }
    });
    inFlightRootScanRef.current = loadPromise;
    void loadPromise;
    return () => {
      cancelled = true;
      pendingRootIdentityRef.current = null;
    };
  }, [enabled, revalidationTick, workspaceRootIdentity]);

  return hasPython;
}

export function resolveVisibleProjectChatStarterPrompts({
  hasPythonInWorkspaceRoot,
}: {
  hasPythonInWorkspaceRoot: boolean;
}): ChatStarterPrompt[] {
  const createProjectStarterPrompt = buildCreateProjectStarterPrompt(
    hasPythonInWorkspaceRoot,
  );

  return CHAT_STARTER_PROMPTS.filter(
    (starterPrompt) =>
      !starterPrompt.requiresPython || hasPythonInWorkspaceRoot,
  ).map((starterPrompt) => {
    if (starterPrompt.id !== "create-project") {
      return starterPrompt;
    }
    return {
      ...starterPrompt,
      prompt: createProjectStarterPrompt,
    };
  });
}

export function useProjectChatStarterPrompts({
  enabled,
  projectConfigId,
}: {
  enabled: boolean;
  projectConfigId: string;
}): ChatStarterPrompt[] {
  const workspaceRootIdentity = useWorkspaceRootIdentity(
    enabled,
    projectConfigId,
  );
  const hasPythonInWorkspaceRoot = useHasPythonInWorkspaceRoot(
    enabled,
    workspaceRootIdentity,
  );

  return useMemo(
    () =>
      resolveVisibleProjectChatStarterPrompts({
        hasPythonInWorkspaceRoot,
      }),
    [hasPythonInWorkspaceRoot],
  );
}
