import type { ReactNode } from "react";
import { useEffect } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useLoadSettings } from "state/actions/settings";
import { openWebSocket } from "state/actions/websocketReceive";
import { useLoadShareDeployment } from "state/hooks/share";
import { useShareSession } from "state/stores/sessionStores";
import { AppShell } from "../AppShell";

type ShareWrapperRenderState = {
  doneLoading: boolean;
  is404: boolean;
};

type ShareWrapperChildren =
  | ReactNode
  | ((state: ShareWrapperRenderState) => ReactNode);

type ShareWrapperProps = {
  children: ShareWrapperChildren;
  mode?: "project" | "home";
  manageTitle?: boolean;
};

export function ShareWrapper({
  children,
  mode = "project",
  manageTitle = true,
}: ShareWrapperProps) {
  useShareWebsocket();
  useShareHTMLTitle(mode, manageTitle);
  const loadProject = mode === "project";
  const [doneLoading, is404] = useLoadShareDeployment(loadProject);
  const shareSessionId = useShareSession((x) => x.shareSessionId);
  const settingsLoaded = useLoadSettings({ enabled: Boolean(shareSessionId) });
  const resolvedChildren =
    typeof children === "function"
      ? children({ doneLoading, is404 })
      : children;
  return (
    <AppShell
      isLoading={!settingsLoaded}
      loadingContent={
        <div className="flex flex-col items-center gap-3 text-xs text-setta-500 dark:text-setta-200">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-setta-500/70 border-t-transparent dark:border-setta-600 dark:border-t-transparent" />
          <p>Loading share settings…</p>
        </div>
      }
    >
      {resolvedChildren}
    </AppShell>
  );
}

function useShareWebsocket() {
  const location = useLocation();
  const shareSessionId = useShareSession((x) => x.shareSessionId);

  useEffect(() => {
    if (!shareSessionId) {
      return;
    }
    openWebSocket(location.pathname, shareSessionId);
  }, [location.pathname, shareSessionId]);
}

function useShareHTMLTitle(mode: "project" | "home", enabled: boolean) {
  const { projectConfigName } = useParams();

  useEffect(() => {
    if (!enabled) {
      return;
    }
    document.title = resolveShareTitle(mode, projectConfigName);
  }, [enabled, mode, projectConfigName]);
}

function resolveShareTitle(
  mode: "project" | "home",
  targetConfigName: string | undefined,
): string {
  if (mode === "home") {
    return "Share Home";
  }
  if (targetConfigName) {
    return `Share ${targetConfigName}`;
  }
  return "Share";
}
