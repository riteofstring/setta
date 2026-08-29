import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from "react";
import { useWorkspaceDocument } from "../document/stores";
import { useWorkspaceHost } from "../workspaceHostContext";
import { WorkspaceWindowManager } from "./WorkspaceWindowManager";
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
  /** The measured shell-local viewport used to seed section window geometry. */
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

export function IntegratedWorkspaceWindowManager() {
  const windowing = useContext(WorkspaceWindowingContext);
  if (!windowing) {
    throw new Error(
      "IntegratedWorkspaceWindowManager requires WorkspaceWindowingContextProvider.",
    );
  }
  return (
    <WorkspaceWindowManager
      ariaLabel={windowing.ariaLabel}
      boundaryInsets={windowing.viewport.insets}
      className={windowing.className}
      layoutEditable={windowing.layoutEditable}
      onStateChange={windowing.onStateChange}
      renderers={windowing.renderers}
      shortcuts={windowing.shortcuts}
      state={windowing.state}
    />
  );
}
