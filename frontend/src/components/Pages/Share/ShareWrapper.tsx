import type { ReactNode } from "react";
import { useEffect } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useLoadSettings } from "state/actions/settings";
import { openWebSocket } from "state/actions/websocketReceive";
import { useShareSession } from "state/definitions";
import { useLoadShareDeployment } from "state/hooks/share";
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
};

export function ShareWrapper({ children }: ShareWrapperProps) {
  useShareWebsocket();
  useShareHTMLTitle();
  const [doneLoading, is404] = useLoadShareDeployment();
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
  const { projectConfigName, version, targetProjectConfigName } = useParams();

  useEffect(() => {
    document.title = resolveShareTitle(
      projectConfigName,
      version,
      targetProjectConfigName,
    );
  }, [projectConfigName, targetProjectConfigName, version]);
}

function resolveShareTitle(
  deploymentName: string | undefined,
  version: string | undefined,
  targetConfigName: string | undefined,
): string {
  if (!deploymentName) {
    return "Sharing Mode";
  }
  if (targetConfigName) {
    if (version) {
      return `Share ${deploymentName}/${version}/${targetConfigName}`;
    }
    return `Share ${deploymentName}/${targetConfigName}`;
  }
  if (version) {
    return `Share ${deploymentName}/${version}`;
  }
  return `Share ${deploymentName}`;
}
