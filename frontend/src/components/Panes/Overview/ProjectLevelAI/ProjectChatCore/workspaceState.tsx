import { callOpenAPI, res200 } from "@setta/app-subsystem-frontend-sdk";
import { type ChatStarterPrompt } from "components/Chat/chatComposerControls";
import { getFileBrowserRoot } from "openapi/http";
import { useEffect, useRef, useState } from "react";
import { getDefaultChatDetails } from "state/actions/ai";
import { useAIStore } from "state/definitions";
import { getDefaultChatAppGenerationDetails } from "state/utils/chatAppGeneration";
import {
  loadWorkspacePythonSignal,
  type WorkspacePythonSignalCache,
} from "../workspacePythonSignals";

const hasPythonInWorkspaceRootCache: WorkspacePythonSignalCache = new Map();
const WORKSPACE_PYTHON_SIGNAL_REVALIDATE_MS = 5000;
const DEFAULT_CHAT_APP_GENERATION_DETAILS =
  getDefaultChatAppGenerationDetails();

type AIStoreState = ReturnType<typeof useAIStore.getState>;

// eslint-disable-next-line complexity
export function selectProjectChatCoreState(
  state: AIStoreState,
  surfaceId: string,
  chatId: string | null | undefined,
) {
  const pendingDetails = state.pendingChatDetailsBySurfaceId[surfaceId] ?? null;
  const appGenerationDetails =
    chatId === null || (typeof chatId !== "string" && pendingDetails !== null)
      ? state.pendingChatAppGenerationDetailsBySurfaceId[surfaceId] ??
        DEFAULT_CHAT_APP_GENERATION_DETAILS
      : typeof chatId === "string"
        ? state.chatAppGenerationDetailsByChatId[chatId] ??
          DEFAULT_CHAT_APP_GENERATION_DETAILS
        : DEFAULT_CHAT_APP_GENERATION_DETAILS;
  const shouldUsePendingDraftDetails =
    chatId === null || (typeof chatId !== "string" && pendingDetails !== null);
  if (shouldUsePendingDraftDetails) {
    return {
      ...(pendingDetails ?? getDefaultChatDetails()),
      ...appGenerationDetails,
      usingPendingDraftDetails: pendingDetails !== null,
    };
  }
  if (typeof chatId !== "string") {
    return {
      ...getDefaultChatDetails(),
      ...appGenerationDetails,
      usingPendingDraftDetails: false,
    };
  }
  return {
    ...(state.chatDetails[chatId] ?? getDefaultChatDetails()),
    ...appGenerationDetails,
    usingPendingDraftDetails: false,
  };
}

export function useWorkspaceRootIdentity(
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
    void (async () => {
      const rootResponse = await callOpenAPI(getFileBrowserRoot());
      if (cancelled || !res200(rootResponse) || !rootResponse.data) {
        return;
      }
      const rootPath = rootResponse.data.rootPath.trim();
      setWorkspaceRootIdentity(rootPath || null);
    })();

    return () => {
      cancelled = true;
    };
  }, [enabled, projectConfigId]);

  return workspaceRootIdentity;
}

export function useHasPythonInWorkspaceRoot(
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
      // This stays as visible-page polling because the backend does not keep a
      // websocket-backed watcher for arbitrary workspace-root Python presence.
      // Revalidation is intentionally scoped to the active page instead of
      // pretending there is an authoritative push source for this filesystem probe.
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
      const hasPythonSignals = await loadWorkspacePythonSignal({
        cache: hasPythonInWorkspaceRootCache,
        rootPath,
        revalidate: revalidationTick !== 0,
      });
      if (cancelled) {
        return;
      }
      if (hasPythonSignals === null) {
        if (!cancelled) {
          setHasPython(false);
        }
        return;
      }
      setHasPython(hasPythonSignals);
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

export function EmptyChatState({
  starterPrompts,
  disabled,
  onStarterPrompt,
}: {
  starterPrompts: ChatStarterPrompt[];
  disabled: boolean;
  onStarterPrompt: (prompt: string) => void;
}) {
  const starterButtonClassName =
    "cursor-pointer rounded-md border border-setta-200 px-3 py-2 text-xs font-semibold uppercase tracking-[0.16em] text-setta-600 transition-colors hover:border-setta-400 hover:text-setta-800 disabled:cursor-not-allowed disabled:opacity-50 dark:border-setta-700 dark:text-setta-300 dark:hover:border-setta-500 dark:hover:text-setta-100";

  return (
    <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-3 overflow-y-auto p-3">
      {starterPrompts.map((starterPrompt) => (
        <button
          key={starterPrompt.id}
          type="button"
          className={starterButtonClassName}
          onClick={() => onStarterPrompt(starterPrompt.prompt)}
          disabled={disabled}
        >
          {starterPrompt.label}
        </button>
      ))}
    </div>
  );
}
