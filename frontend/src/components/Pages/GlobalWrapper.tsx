import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { useLoadSettings } from "state/actions/settings";
import { openWebSocket } from "state/actions/websocketReceive";
import { useProjectLoading, useSettings } from "state/definitions";
import { useRuntimeConfig } from "state/hooks/runtimeConfig";
import { HOME_ROUTER_PATH, SETTINGS_ROUTER_PATH } from "utils/constants";
import { res200 } from "utils/endpointUtils";
import {
  route_get_backend_init_status,
  router_get_default_project_config_name,
} from "utils/generatedEndpoints";
import type { BackendInitStatusResponse } from "utils/generatedTypes";

export function GlobalWrapper({ children }) {
  const runtimeConfigReady = useRuntimeConfig();
  useOpenCloseWebsocket(runtimeConfigReady);
  useSetHTMLTitle();
  const settingsLoaded = useLoadSettings(runtimeConfigReady);
  const initStatus = useBackendInitStatus(runtimeConfigReady);
  const backendReady = initStatus?.isReady ?? false;
  const shouldShowLoading =
    !runtimeConfigReady || !settingsLoaded || !backendReady;

  if (shouldShowLoading) {
    return (
      <div className="app-shell flex min-h-screen min-w-full flex-col items-center justify-center px-6">
        <LoadingScreen
          initStatus={initStatus}
          settingsLoaded={settingsLoaded}
          runtimeConfigReady={runtimeConfigReady}
        />
      </div>
    );
  }

  return (
    <div className="app-base flex min-h-0 min-w-full flex-1 flex-col bg-setta-light dark:bg-setta-dark">
      {children}
    </div>
  );
}

export function IndexRouteComponent() {
  const showDefaultConfigOnLoad = useSettings(
    (x) => x.backend.showDefaultConfigOnLoad,
  );
  const defaultProjectConfigName = useDefaultProjectConfigName();
  if (defaultProjectConfigName === undefined) {
    return null;
  }

  if (!showDefaultConfigOnLoad || defaultProjectConfigName === null) {
    return <Navigate to={HOME_ROUTER_PATH} replace />;
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

function useOpenCloseWebsocket(runtimeConfigReady: boolean) {
  const location = useLocation();

  useEffect(() => {
    if (runtimeConfigReady) {
      openWebSocket(location.pathname);
    }
  }, [location.pathname, runtimeConfigReady]);
}

function useDefaultProjectConfigName() {
  const [defaultProjectConfigName, setDefaultProjectConfigName] = useState<
    string | null | undefined
  >(undefined);

  async function fn() {
    const res = await router_get_default_project_config_name();
    if (res200(res)) {
      setDefaultProjectConfigName(res.data);
    }
  }

  useEffect(() => {
    fn();
  }, []);

  return defaultProjectConfigName;
}

function useBackendInitStatus(runtimeConfigReady: boolean) {
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

    if (runtimeConfigReady) {
      poll();
      intervalId = window.setInterval(() => {
        void poll();
      }, 500);
    }

    return () => {
      isMounted = false;
      if (intervalId !== undefined) {
        clearInterval(intervalId);
      }
    };
  }, [runtimeConfigReady]);

  return status;
}

type LoadingScreenProps = {
  initStatus: BackendInitStatusResponse | null;
  runtimeConfigReady: boolean;
  settingsLoaded: boolean;
};

function LoadingScreen({
  initStatus,
  runtimeConfigReady,
  settingsLoaded,
}: LoadingScreenProps) {
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
        {!runtimeConfigReady && <p>Loading connection config…</p>}
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
