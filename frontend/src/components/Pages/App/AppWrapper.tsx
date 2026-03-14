import type { ReactNode } from "react";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useLoadSettings } from "state/actions/settings";
import { openWebSocket } from "state/actions/websocketReceive";
import { useLoadAppDeployment } from "state/hooks/app";
import { useAllProjectMetadata, useShareSession } from "state/stores/sessionStores";
import { AppShell } from "../AppShell";

type AppWrapperRenderState = {
  doneLoading: boolean;
  is404: boolean;
};

type AppWrapperChildren =
  | ReactNode
  | ((state: AppWrapperRenderState) => ReactNode);

type AppWrapperProps = {
  children: AppWrapperChildren;
};

export function AppWrapper({ children }: AppWrapperProps) {
  useAppWebsocket();
  useAppHtmlTitle();
  const [doneLoading, is404] = useLoadAppDeployment();
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
          <p>Loading app…</p>
        </div>
      }
    >
      {resolvedChildren}
    </AppShell>
  );
}

function useAppWebsocket() {
  const location = useLocation();
  const shareSessionId = useShareSession((x) => x.shareSessionId);

  useEffect(() => {
    if (!shareSessionId) {
      return;
    }
    openWebSocket(location.pathname, shareSessionId);
  }, [location.pathname, shareSessionId]);
}

function useAppHtmlTitle() {
  const { defaultProjectConfigId, projectMetadata } = useAllProjectMetadata(
    (x) => x,
  );
  const projectName = projectMetadata.find(
    (config) => config.id === defaultProjectConfigId,
  )?.name;

  useEffect(() => {
    if (projectName) {
      document.title = `${projectName} App`;
    } else {
      document.title = "App";
    }
  }, [projectName]);
}
