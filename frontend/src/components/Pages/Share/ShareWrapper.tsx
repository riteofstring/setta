import { useEffect } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useLoadSettings } from "state/actions/settings";
import { openWebSocket } from "state/actions/websocketReceive";
import { useShareSession } from "state/definitions";

export function ShareWrapper({ children }) {
  useShareWebsocket();
  useShareHTMLTitle();
  const settingsLoaded = useLoadSettings();
  if (!settingsLoaded) {
    return (
      <div className="app-shell flex min-h-screen min-w-full flex-col items-center justify-center px-6">
        <div className="flex flex-col items-center gap-3 text-xs text-setta-500 dark:text-setta-200">
          <div className="h-12 w-12 animate-spin rounded-full border-2 border-setta-500/70 border-t-transparent dark:border-setta-600 dark:border-t-transparent" />
          <p>Loading share settings…</p>
        </div>
      </div>
    );
  }
  return (
    <div className="app-base flex min-h-0 min-w-full flex-1 flex-col bg-setta-light dark:bg-setta-dark">
      {children}
    </div>
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
