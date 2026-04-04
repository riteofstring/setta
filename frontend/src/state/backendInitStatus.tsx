import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { res200 } from "utils/endpointUtils";
import { route_get_backend_init_status } from "utils/generatedEndpoints";
import type { BackendInitStatusResponse } from "utils/generatedTypes";

const BackendInitStatusContext =
  createContext<BackendInitStatusResponse | null>(null);

function buildBackendInitStatusLoadError(): BackendInitStatusResponse {
  return {
    events: [],
    isReady: false,
    error: "Failed to load backend init status.",
    authCookieRefreshWindowSeconds: 0,
    worktreeName: null,
  };
}

export function BackendInitStatusProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [status, setStatus] = useState<BackendInitStatusResponse | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      const res = await route_get_backend_init_status();
      if (cancelled) {
        return;
      }
      if (!res200(res)) {
        setStatus(buildBackendInitStatusLoadError());
        return;
      }
      setStatus(res.data);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <BackendInitStatusContext.Provider value={status}>
      {children}
    </BackendInitStatusContext.Provider>
  );
}

export function useBackendInitStatus() {
  return useContext(BackendInitStatusContext);
}
