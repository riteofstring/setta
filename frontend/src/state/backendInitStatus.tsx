import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { res200, type ResponseDataAndStatus } from "utils/endpointUtils";
import { route_get_backend_init_status } from "utils/generatedEndpoints";
import type { BackendInitStatusResponse } from "utils/generatedTypes";

const BACKEND_INIT_STATUS_RETRY_DELAY_MS = 500;

type BackendInitStatusRouteResponse =
  ResponseDataAndStatus<BackendInitStatusResponse>;

const BackendInitStatusContext =
  createContext<BackendInitStatusResponse | null>(null);

export function BackendInitStatusProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [status, setStatus] = useState<BackendInitStatusResponse | null>(null);

  useEffect(() => {
    let isMounted = true;
    let retryTimeout: number | undefined;

    async function loadBackendInitStatus() {
      const res: BackendInitStatusRouteResponse =
        await route_get_backend_init_status();

      if (!isMounted) {
        return;
      }

      if (!res200(res)) {
        retryTimeout = window.setTimeout(() => {
          retryTimeout = undefined;
          void loadBackendInitStatus();
        }, BACKEND_INIT_STATUS_RETRY_DELAY_MS);
        return;
      }

      setStatus(res.data);
      if (!res.data.isReady) {
        retryTimeout = window.setTimeout(() => {
          retryTimeout = undefined;
          void loadBackendInitStatus();
        }, BACKEND_INIT_STATUS_RETRY_DELAY_MS);
      }
    }

    void loadBackendInitStatus();

    return () => {
      isMounted = false;
      if (retryTimeout !== undefined) {
        window.clearTimeout(retryTimeout);
      }
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
