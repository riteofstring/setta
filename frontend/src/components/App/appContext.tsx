import { createContext, useContext } from "react";
import type { SharePolicy } from "utils/generatedTypes";

import type { AppActionDefinitions, AppDataBindings } from "./appBindings";

export type AppActionState = {
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

export type AppRuntimeContextValue = {
  dataBindings: AppDataBindings;
  actions: AppActionDefinitions;
  policy: SharePolicy;
  canEditParams: boolean;
  allowExternalLinks: boolean;
  allowFileDownloads: boolean;
};

const AppRuntimeContext = createContext<AppRuntimeContextValue | null>(null);

export function useAppActionState() {
  return useContext(AppActionContext);
}

export function useAppRuntime() {
  return useContext(AppRuntimeContext);
}

export { AppActionContext, AppRuntimeContext };
