import {
  createAppSubsystemFrontendHost,
  type AppSubsystemFrontendHost,
  type AppSubsystemProjectContext,
  type AppSubsystemRuntimeContext,
} from "@setta/app-subsystem-frontend-sdk";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

const DEFAULT_APP_SUBSYSTEM_FRONTEND_HOST = createAppSubsystemFrontendHost();

const AppSubsystemFrontendHostContext = createContext<AppSubsystemFrontendHost>(
  DEFAULT_APP_SUBSYSTEM_FRONTEND_HOST,
);

export function AppSubsystemFrontendHostProvider({
  children,
  host,
}: {
  children: ReactNode;
  host: AppSubsystemFrontendHost;
}) {
  return (
    <AppSubsystemFrontendHostContext.Provider value={host}>
      {children}
    </AppSubsystemFrontendHostContext.Provider>
  );
}

export function useAppSubsystemFrontendHost(): AppSubsystemFrontendHost {
  return useContext(AppSubsystemFrontendHostContext);
}

export function useAppSubsystemProjectContext(): AppSubsystemProjectContext {
  const host = useAppSubsystemFrontendHost();
  const [projectContext, setProjectContext] = useState(() =>
    host.getProjectContext(),
  );

  useEffect(() => {
    setProjectContext(host.getProjectContext());
    return host.subscribeProjectContext((nextProjectContext) => {
      setProjectContext(nextProjectContext);
    });
  }, [host]);

  return projectContext;
}

export function useAppSubsystemRuntimeContext(): AppSubsystemRuntimeContext {
  const host = useAppSubsystemFrontendHost();
  const [runtimeContext, setRuntimeContext] = useState(() =>
    host.getRuntimeContext(),
  );

  useEffect(() => {
    setRuntimeContext(host.getRuntimeContext());
    return host.subscribeRuntimeContext((nextRuntimeContext) => {
      setRuntimeContext(nextRuntimeContext);
    });
  }, [host]);

  return runtimeContext;
}
