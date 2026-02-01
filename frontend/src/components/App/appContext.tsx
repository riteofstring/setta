import { createContext, useContext } from "react";

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

export function useAppActionState() {
  return useContext(AppActionContext);
}

export { AppActionContext };
