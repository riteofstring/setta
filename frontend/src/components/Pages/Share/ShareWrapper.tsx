import type { ReactNode } from "react";
import { useEffect } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useLoadSettings } from "state/actions/settings";
import { openWebSocket } from "state/actions/websocketReceive";
import { useShareSession } from "state/definitions";
import { useLoadShareDeployment } from "state/hooks/share";
import { SHARE_HOME_ROUTE_SEGMENT } from "utils/constants";
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
};

export function ShareWrapper({
  children,
  mode = "project",
}: ShareWrapperProps) {
  useShareWebsocket();
  useShareHTMLTitle();
  const loadProject = mode === "project";
  const [doneLoading, is404] = useLoadShareDeployment(loadProject);
  const settingsLoaded = useLoadSettings();
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

function useShareHTMLTitle() {
  const { version, targetProjectConfigName } = useParams();

  useEffect(() => {
    document.title = resolveShareTitle(version, targetProjectConfigName);
  }, [targetProjectConfigName, version]);
}

function resolveShareTitle(
  version: string | undefined,
  targetConfigName: string | undefined,
): string {
  if (!version) {
    return "Sharing Mode";
  }
  if (targetConfigName === SHARE_HOME_ROUTE_SEGMENT) {
    return `Share ${version} Home`;
  }
  if (targetConfigName) {
    return `Share ${version}/${targetConfigName}`;
  }
  return `Share ${version}`;
}
