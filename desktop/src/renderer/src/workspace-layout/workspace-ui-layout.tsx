import type { DesktopPlatform } from "@shared/types";
import { LoaderCircle, Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import type { InitialEasyButtonPaneStartup as InitialConversationPaneStartup } from "../features/easy-button/initial-easy-button-pane";
import {
  appPaneLayoutFromWorkspaceScene,
  appPaneLayoutToWorkspaceUILayout,
} from "./app-pane-layout-adapter";
import type { WorkspaceSceneMode } from "./runtime-mode-options";
import type { WorkspaceRuntime } from "./workspace-runtime";
import type { RealWorkspaceStoredLayout } from "./workspace-scene";

export type WorkspaceUILayoutLoad =
  | {
      error: null;
      key: string;
      layout: RealWorkspaceStoredLayout | null;
      maximizedPaneId: string | null;
      status: "loaded";
    }
  | {
      error: string;
      key: string;
      layout: null;
      maximizedPaneId: null;
      status: "failed";
    }
  | {
      error: null;
      key: string;
      layout: null;
      maximizedPaneId: null;
      status: "loading";
    };

export function WorkspaceLayoutLoading({
  initialConversationPaneStartup,
  mode,
  platform,
  workspaceId,
}: {
  initialConversationPaneStartup: InitialConversationPaneStartup;
  mode: WorkspaceSceneMode;
  platform: DesktopPlatform;
  workspaceId: string;
}) {
  return (
    <section
      aria-label={workspaceLayoutAreaLabel(mode)}
      className="workspace-layout-area relative h-full min-h-0 min-w-0 flex-1 overflow-hidden bg-background"
      data-browser-pane-count="0"
      data-desktop-platform={platform}
      data-maximized-pane-id=""
      data-pane-count="0"
      data-presentation-mode="normal"
      data-workspace-mode={mode}
      data-workspace-id={workspaceId}
      data-testid="workspace-layout-area"
    >
      <WorkspaceInitialConversationPane startup={initialConversationPaneStartup} />
    </section>
  );
}

export function WorkspaceInitialConversationPane({
  startup,
}: {
  startup: InitialConversationPaneStartup;
}) {
  if (startup === null) {
    return null;
  }
  return (
    <article
      aria-busy="true"
      aria-label="Conversation pane is starting"
      className="app-no-drag absolute inset-2 z-40 grid min-h-0 grid-rows-[42px_minmax(0,1fr)] overflow-hidden rounded-[20px] border border-cyan-400/50 bg-background shadow-2xl"
      data-startup-state={startup}
      data-testid="initial-easy-button-pane"
    >
      <header className="flex items-center gap-2 border-b border-cyan-400/30 px-4 text-sm text-foreground">
        <Sparkles aria-hidden="true" className="h-4 w-4 text-cyan-300" />
        <span>Conversation</span>
      </header>
      <main className="grid place-items-center">
        <p className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
          <LoaderCircle aria-hidden="true" className="h-4 w-4 animate-spin" />
          {initialConversationStartupLabel(startup)}
        </p>
      </main>
    </article>
  );
}

function initialConversationStartupLabel(startup: Exclude<InitialConversationPaneStartup, null>) {
  switch (startup) {
    case "creating":
      return "Starting conversation…";
    case "loading":
      return "Preparing conversation…";
    case "opening":
      return "Opening conversation…";
    default:
      return assertNever(startup);
  }
}

export function useWorkspaceUILayoutLoad(
  workspaceId: string,
  workspaceRootPath: string | null,
  mode: WorkspaceSceneMode,
): WorkspaceUILayoutLoad {
  const key = `${mode}:${workspaceId}`;
  const [state, setState] = useState<WorkspaceUILayoutLoad>(() =>
    initialWorkspaceUILayoutLoadState(workspaceId, mode),
  );
  const shouldLoad = shouldLoadWorkspaceUILayout(workspaceId, mode);

  useEffect(() => {
    if (!shouldLoad) {
      setState({
        error: null,
        key,
        layout: null,
        maximizedPaneId: null,
        status: "loaded",
      });
      return;
    }

    let cancelled = false;
    setState({
      error: null,
      key,
      layout: null,
      maximizedPaneId: null,
      status: "loading",
    });
    window.setta.appLayout
      .readPaneLayout()
      .then((result) => {
        if (cancelled) {
          return;
        }
        const loaded = appPaneLayoutToWorkspaceUILayout({
          layout: result.layout,
          workspaceId,
          workspaceRootPath,
        });
        setState({
          error: null,
          key,
          layout: loaded.layout,
          maximizedPaneId: loaded.maximizedPaneId,
          status: "loaded",
        });
      })
      .catch((error: unknown) => {
        if (cancelled) {
          return;
        }
        setState({
          error: `App pane layout state could not be loaded: ${layoutOperationErrorMessage(error)}`,
          key,
          layout: null,
          maximizedPaneId: null,
          status: "failed",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [key, shouldLoad, workspaceId, workspaceRootPath]);

  if (!shouldLoad) {
    return {
      error: null,
      key,
      layout: null,
      maximizedPaneId: null,
      status: "loaded",
    };
  }
  if (state.key !== key) {
    return {
      error: null,
      key,
      layout: null,
      maximizedPaneId: null,
      status: "loading",
    };
  }
  return state;
}

export function initialWorkspaceUILayoutLoadState(
  workspaceId: string,
  mode: WorkspaceSceneMode,
): WorkspaceUILayoutLoad {
  const key = `${mode}:${workspaceId}`;
  if (shouldLoadWorkspaceUILayout(workspaceId, mode)) {
    return {
      error: null,
      key,
      layout: null,
      maximizedPaneId: null,
      status: "loading",
    };
  }
  return {
    error: null,
    key,
    layout: null,
    maximizedPaneId: null,
    status: "loaded",
  };
}

export function useWorkspaceUILayoutPersistence(
  runtime: WorkspaceRuntime,
  workspaceRootPath: string | null,
) {
  const pendingLayoutSaveRef = useRef<Promise<unknown>>(Promise.resolve());
  const [layoutPersistenceError, setLayoutPersistenceError] = useState<string | null>(null);

  const persistLayout = useCallback(() => {
    runtime.presentation.syncPanes(runtime.store.toScene().panes);
    if (runtime.mode !== "workspace") {
      return Promise.resolve(true);
    }
    const snapshot = runtime.store.getSnapshot();
    const layout = appPaneLayoutFromWorkspaceScene({
      focusedPaneId: snapshot.focusedPaneId,
      maximizedPaneId: snapshot.maximizedPaneId,
      scene: runtime.store.toScene(),
      workspaceRootPath,
    });
    let persisted = true;
    pendingLayoutSaveRef.current = pendingLayoutSaveRef.current
      .catch(() => {})
      .then(() => window.setta.appLayout.savePaneLayout(layout))
      .then(() => {
        setLayoutPersistenceError(null);
      })
      .catch((error: unknown) => {
        persisted = false;
        setLayoutPersistenceError(layoutOperationErrorMessage(error));
      });
    return pendingLayoutSaveRef.current.then(() => persisted);
  }, [runtime, workspaceRootPath]);
  const resetLayoutPersistenceError = useCallback(() => {
    setLayoutPersistenceError(null);
  }, []);

  return { layoutPersistenceError, persistLayout, resetLayoutPersistenceError };
}

export function workspaceLayoutRecoveryMessage({
  dismissed,
  layoutLoadError,
  layoutPersistenceError,
  runtime,
}: {
  dismissed: boolean;
  layoutLoadError: string | null;
  layoutPersistenceError: string | null;
  runtime: WorkspaceRuntime;
}): string | null {
  if (dismissed) {
    return null;
  }
  return layoutLoadError ?? layoutPersistenceError ?? runtime.layoutRecovery?.message ?? null;
}

export function workspaceLayoutAreaLabel(mode: WorkspaceSceneMode): string {
  return mode === "benchmark" ? "Workspace benchmark workspace" : "Workspace workspace";
}

function shouldLoadWorkspaceUILayout(workspaceId: string, mode: WorkspaceSceneMode): boolean {
  return (
    mode === "workspace" &&
    workspaceId !== "empty" &&
    typeof window !== "undefined" &&
    Boolean(window.setta?.appLayout?.readPaneLayout)
  );
}

function layoutOperationErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "App pane layout operation failed";
}

function assertNever(value: never): never {
  throw new Error(`Unhandled conversation startup state: ${String(value)}`);
}
