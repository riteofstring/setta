import { useEffect, useMemo, useState } from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";
import { useLoadSettings } from "state/actions/settings";
import { openWebSocket } from "state/actions/websocketReceive";
import { useProjectLoading, useSettings } from "state/definitions";
import { HOME_ROUTER_PATH, SETTINGS_ROUTER_PATH } from "utils/constants";
import { res200 } from "utils/endpointUtils";
import {
  route_get_backend_init_status,
  router_get_default_project_config_name,
} from "utils/generatedEndpoints";

export function GlobalWrapper({ children }) {
  useOpenCloseWebsocket();
  useSetHTMLTitle();
  const settingsLoaded = useLoadSettings();
  const initStatus = useBackendInitStatus();
  const backendReady = initStatus?.isReady ?? false;
  if (!settingsLoaded || !backendReady) {
    return (
      <LoadingScreen initStatus={initStatus} settingsLoaded={settingsLoaded} />
    );
  }
  return children;
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

function useOpenCloseWebsocket() {
  const location = useLocation();

  useEffect(() => {
    openWebSocket(location.pathname);
  }, [location.pathname]);
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
    <section className="flex min-h-screen min-w-full flex-col items-center justify-center gap-4 bg-neutral-100 px-6 text-neutral-500">
      <div className="h-12 w-12 animate-spin rounded-full border-2 border-neutral-400 border-t-transparent" />
      <div className="text-sm uppercase tracking-[0.3em]">Preparing setta</div>
      <div className="space-y-1 text-center text-xs text-neutral-500">
        {!settingsLoaded && <p>Loading settings…</p>}
        <p>Backend: {backendMessage}</p>
      </div>
      {errorMessage && (
        <p className="text-xs text-red-500">Backend error: {errorMessage}</p>
      )}
      {history.length > 0 && (
        <ul className="text-[11px] text-neutral-400">
          {history.map((event) => (
            <li key={`${event.message}-${event.timestamp}`}>{event.message}</li>
          ))}
        </ul>
      )}
    </section>
  );
}
