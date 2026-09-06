import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useWorkspaceDocument } from "../document/stores";
import { useWorkspaceHost } from "../workspaceHostContext";
import type { WorkspaceWindowRenderers } from "./WorkspaceWindowManagerParts";
import { reconcileWorkspaceSectionWindowBindings } from "./workspaceSectionWindowing";
import type {
  WorkspaceWindowingState,
  WorkspaceWindowViewport,
} from "./windowingTypes";

export type WorkspaceShellWindowingConfiguration = {
  state: WorkspaceWindowingState;
  onStateChange: (nextState: WorkspaceWindowingState) => void;
  renderers: WorkspaceWindowRenderers;

  viewport: WorkspaceWindowViewport;
  layoutEditable?: boolean;
  shortcuts?: boolean;
  ariaLabel?: string;
  className?: string;
};

type WorkspaceWindowingContextValue = Omit<
  WorkspaceShellWindowingConfiguration,
  "layoutEditable" | "shortcuts"
> & {
  layoutEditable: boolean;
  shortcuts: boolean;
};

const WorkspaceWindowingContext =
  createContext<WorkspaceWindowingContextValue | null>(null);

export function WorkspaceWindowingContextProvider({
  children,
  configuration,
}: {
  children: ReactNode;
  configuration: WorkspaceShellWindowingConfiguration;
}) {
  const host = useWorkspaceHost();
  const document = useWorkspaceDocument((state) => state);
  const reconciledState = useMemo(
    () =>
      reconcileWorkspaceSectionWindowBindings(
        host,
        document,
        configuration.state,
      ),
    [configuration.state, document, host],
  );
  const value = useMemo<WorkspaceWindowingContextValue>(
    () => ({
      ...configuration,
      state: reconciledState,
      layoutEditable: configuration.layoutEditable ?? true,
      shortcuts: configuration.shortcuts ?? true,
    }),
    [configuration, reconciledState],
  );
  useEffect(() => {
    if (reconciledState !== configuration.state) {
      configuration.onStateChange(reconciledState);
    }
  }, [configuration, reconciledState]);
  return (
    <WorkspaceWindowingContext.Provider value={value}>
      {children}
    </WorkspaceWindowingContext.Provider>
  );
}

export function useOptionalWorkspaceWindowing(): WorkspaceWindowingContextValue | null {
  return useContext(WorkspaceWindowingContext);
}
