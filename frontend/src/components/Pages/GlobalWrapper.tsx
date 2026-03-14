import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { loadAllProjectMetadata } from "state/actions/project/loadProject";
import { useLoadSettings } from "state/actions/settings";
import { openWebSocket } from "state/actions/websocketReceive";
import {
  useAllProjectMetadata,
  useLocalStorage,
  useProjectLoading,
  useSettings,
  useShareSession,
} from "state/definitions";
import { HOME_ROUTER_PATH, SETTINGS_ROUTER_PATH } from "utils/constants";
import { res200 } from "utils/endpointUtils";
import { route_get_backend_init_status } from "utils/generatedEndpoints";
import type { BackendInitStatusResponse } from "utils/generatedTypes";
import { AppShell } from "./AppShell";
import {
  resolveDefaultProjectConfigName,
  shouldLoadDefaultProjectMetadata,
} from "./defaultProjectRouting";

const THEME_COLOR_LIGHT = "#dce1ea";
const THEME_COLOR_DARK = "#0b0e13";

export function GlobalWrapper({ children }) {
  useOpenCloseWebsocket();
  useSetHTMLTitle();
  useColorModePreference();
  const settingsLoaded = useLoadSettings();
  const initStatus = useBackendInitStatus();
  const backendReady = initStatus?.isReady ?? false;
  const shouldShowLoading = !settingsLoaded || !backendReady;

  return (
    <AppShell
      isLoading={shouldShowLoading}
      loadingContent={
        <LoadingScreen
          initStatus={initStatus}
          settingsLoaded={settingsLoaded}
        />
      }
    >
      {children}
    </AppShell>
  );
}

export function IndexRouteComponent() {
  const showDefaultConfigOnLoad = useSettings(
    (x) => x.backend.showDefaultConfigOnLoad,
  );
  const defaultProjectConfigName = useDefaultProjectConfigName(
    showDefaultConfigOnLoad,
  );
  if (!showDefaultConfigOnLoad || defaultProjectConfigName === null) {
    return <Navigate to={HOME_ROUTER_PATH} replace />;
  }
  if (defaultProjectConfigName === undefined) {
    return null;
  }

  return <Navigate to={defaultProjectConfigName} replace />;
}

function useSetHTMLTitle() {
  const { pathname } = useLocation();
  const { projectConfigName } = useParams();
  const projectIs404 = useProjectLoading((x) => x.projectIs404);
  useEffect(() => {
    if (pathname === HOME_ROUTER_PATH) {
      document.title = "Home";
    } else if (pathname === SETTINGS_ROUTER_PATH) {
      document.title = "Settings";
    } else if (projectConfigName) {
      document.title = projectIs404 ? "Not Found" : projectConfigName;
    } else {
      document.title = "setta.dev";
    }
  }, [pathname, projectConfigName, projectIs404]);
}

function useColorModePreference() {
  const colorMode = useLocalStorage((x) => x.colorMode);

  useEffect(() => {
    const root = document.documentElement;

    const applyDarkMode = (nextDarkMode: boolean) => {
      if (nextDarkMode) {
        root.classList.add("dark");
      } else {
        root.classList.remove("dark");
      }

      const themeMeta = document.querySelector('meta[name="theme-color"]');
      if (themeMeta) {
        themeMeta.setAttribute(
          "content",
          nextDarkMode ? THEME_COLOR_DARK : THEME_COLOR_LIGHT,
        );
      }

      if (useLocalStorage.getState().darkMode !== nextDarkMode) {
        useLocalStorage.setState({ darkMode: nextDarkMode });
      }
    };

    if (colorMode === "auto") {
      const media = window.matchMedia("(prefers-color-scheme: dark)");
      applyDarkMode(media.matches);

      const handleChange = () => {
        applyDarkMode(media.matches);
      };

      media.addEventListener("change", handleChange);
      return () => {
        media.removeEventListener("change", handleChange);
      };
    }

    applyDarkMode(colorMode === "dark");
    return undefined;
  }, [colorMode]);
}

function useOpenCloseWebsocket() {
  const location = useLocation();
  const shareSessionId = useShareSession((x) => x.shareSessionId);

  useEffect(() => {
    openWebSocket(location.pathname, shareSessionId);
  }, [location.pathname, shareSessionId]);
}

function useDefaultProjectConfigName(enabled: boolean) {
  const defaultProjectConfigId = useAllProjectMetadata(
    (x) => x.defaultProjectConfigId,
  );
  const projectMetadata = useAllProjectMetadata((x) => x.projectMetadata);
  const [defaultProjectConfigName, setDefaultProjectConfigName] = useState<
    string | null | undefined
  >(undefined);
  const [hasAttemptedMetadataLoad, setHasAttemptedMetadataLoad] =
    useState(false);

  useEffect(() => {
    const resolvedDefaultProjectConfigName = resolveDefaultProjectConfigName(
      defaultProjectConfigId,
      projectMetadata,
    );
    if (resolvedDefaultProjectConfigName !== null) {
      setDefaultProjectConfigName(resolvedDefaultProjectConfigName);
      return;
    }
    if (!enabled || hasAttemptedMetadataLoad || projectMetadata.length > 0) {
      setDefaultProjectConfigName(null);
    }
  }, [
    defaultProjectConfigId,
    enabled,
    hasAttemptedMetadataLoad,
    projectMetadata,
  ]);

  useEffect(() => {
    if (
      !shouldLoadDefaultProjectMetadata({
        enabled,
        hasAttemptedMetadataLoad,
        projectMetadataCount: projectMetadata.length,
      })
    ) {
      return;
    }

    let isCancelled = false;
    void (async () => {
      await loadAllProjectMetadata();
      if (!isCancelled) {
        setHasAttemptedMetadataLoad(true);
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [enabled, hasAttemptedMetadataLoad, projectMetadata.length]);

  return defaultProjectConfigName;
}

function useBackendInitStatus() {
  const [status, setStatus] = useState<BackendInitStatusResponse | null>(null);

  useEffect(() => {
    let isMounted = true;
    let intervalId: number | undefined;

    async function poll() {
      const res = await route_get_backend_init_status();
      if (!isMounted || !res200(res)) {
        return;
      }
      setStatus(res.data);
      if (res.data.isReady && intervalId !== undefined) {
        clearInterval(intervalId);
        intervalId = undefined;
      }
    }

    poll();
    intervalId = window.setInterval(() => {
      void poll();
    }, 500);

    return () => {
      isMounted = false;
      if (intervalId !== undefined) {
        clearInterval(intervalId);
      }
    };
  }, []);

  return status;
}

type LoadingScreenProps = {
  initStatus: BackendInitStatusResponse | null;
  settingsLoaded: boolean;
};

function LoadingScreen({ initStatus, settingsLoaded }: LoadingScreenProps) {
  const events = initStatus?.events ?? [];
  const lastEvent = events.length > 0 ? events[events.length - 1] : undefined;
  const backendMessage = lastEvent?.message ?? "Starting backend services";
  const errorMessage = initStatus?.error;
  const history = useMemo(() => events.slice(-3).reverse(), [events]);

  return (
    <section className="flex flex-col items-center justify-center gap-4 text-setta-600 dark:text-setta-100">
      <div className="h-12 w-12 animate-spin rounded-full border-2 border-setta-500/70 border-t-transparent dark:border-setta-600 dark:border-t-transparent" />
      <div className="text-sm uppercase tracking-[0.3em] text-setta-500 dark:text-setta-200">
        Preparing setta
      </div>
      <div className="space-y-1 text-center text-xs text-setta-500 dark:text-setta-200">
        {!settingsLoaded && <p>Loading settings…</p>}
        <p>Backend: {backendMessage}</p>
      </div>
      {errorMessage && (
        <p className="text-xs text-red-500">Backend error: {errorMessage}</p>
      )}
      {history.length > 0 && (
        <ul className="text-[11px] text-setta-400 dark:text-setta-500">
          {history.map((event) => (
            <li key={`${event.message}-${event.timestamp}`}>{event.message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
