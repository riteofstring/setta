import { createContext, useContext } from "react";
import type { Policy } from "@setta/app-subsystem-frontend-sdk";

import type { AppActionDefinitions, AppDataBindings } from "./appBindings";
import type { ResolvedAppTheme } from "./appTheme";

type AppActionState = {
  canRun: boolean;
  canReset: boolean;
  isRunning: boolean;
  runDisabledReason: string | null;
};

const AppActionContext = createContext<AppActionState>({
  canRun: true,
  canReset: true,
  isRunning: false,
  runDisabledReason: null,
});

type AppRuntimeContextValue = {
  dataBindings: AppDataBindings;
  actions: AppActionDefinitions;
  policy: Policy;
  canEditParams: boolean;
  allowExternalLinks: boolean;
  allowFileDownloads: boolean;
  defaultConfigId: string | null;
  theme: ResolvedAppTheme | null;
};

const AppRuntimeContext = createContext<AppRuntimeContextValue | null>(null);

type AppConfigScope = {
  configId: string | null;
};

const AppConfigScopeContext = createContext<AppConfigScope>({ configId: null });

export function useAppActionState() {
  return useContext(AppActionContext);
}

export function useAppRuntime() {
  return useContext(AppRuntimeContext);
}

export function useAppConfigScope() {
  return useContext(AppConfigScopeContext);
}

export { AppActionContext, AppConfigScopeContext, AppRuntimeContext };
