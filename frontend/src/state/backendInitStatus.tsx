import { callOpenAPI, res200 } from "@setta/app-subsystem-frontend-sdk";
import {
  getBackendInitStatus,
  type HttpapiBackendInitStatusResponse as BackendInitStatusResponse,
} from "openapi/http";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

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
      const res = await callOpenAPI(getBackendInitStatus());
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
