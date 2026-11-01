import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useWorkspaceDocument } from "../document/stores.js";
import { useWorkspaceHost } from "../workspaceHostContext.js";
import type { WorkspaceWindowRenderers } from "./WorkspaceWindowManagerParts.js";
import { reconcileWorkspaceSectionWindowBindings } from "./workspaceSectionWindowing.js";
import type {
  WorkspaceWindowBoundaryInsets,
  WorkspaceWindowingState,
  WorkspaceWindowViewport,
} from "./windowingTypes.js";
import { areWorkspaceWindowViewportsEqual } from "./workspaceWindowManagerInteractions.js";

export type WorkspaceShellWindowingConfiguration = {
  state: WorkspaceWindowingState;
  onStateChange: (nextState: WorkspaceWindowingState) => void;
  renderers: WorkspaceWindowRenderers;

  onViewportChange?: (viewport: WorkspaceWindowViewport) => void;
  layoutEditable?: boolean;
  shortcuts?: boolean;
  ariaLabel?: string;
  className?: string;
};

type WorkspaceWindowingContextValue = Omit<
  WorkspaceShellWindowingConfiguration,
  "layoutEditable" | "onViewportChange" | "shortcuts"
> & {
  boundaryInsets: WorkspaceWindowBoundaryInsets | null;
  layoutEditable: boolean;
  onViewportChange: (viewport: WorkspaceWindowViewport) => void;
  shortcuts: boolean;
  viewport: WorkspaceWindowViewport | null;
};

const WorkspaceWindowingContext =
  createContext<WorkspaceWindowingContextValue | null>(null);

export function WorkspaceWindowingContextProvider({
  boundaryInsets,
  children,
  configuration,
}: {
  boundaryInsets: WorkspaceWindowBoundaryInsets | null;
  children: ReactNode;
  configuration: WorkspaceShellWindowingConfiguration;
}) {
  const host = useWorkspaceHost();
  const document = useWorkspaceDocument((state) => state);
  const onViewportChangeRef = useRef(configuration.onViewportChange);
  const [viewport, setViewport] = useState<WorkspaceWindowViewport | null>(
    null,
  );
  onViewportChangeRef.current = configuration.onViewportChange;
  const onViewportChange = useCallback(
    (nextViewport: WorkspaceWindowViewport) => {
      setViewport((current) =>
        current && areWorkspaceWindowViewportsEqual(current, nextViewport)
          ? current
          : nextViewport,
      );
    },
    [],
  );
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
      boundaryInsets,
      onViewportChange,
      state: reconciledState,
      layoutEditable: configuration.layoutEditable ?? true,
      shortcuts: configuration.shortcuts ?? true,
      viewport,
    }),
    [
      boundaryInsets,
      configuration,
      onViewportChange,
      reconciledState,
      viewport,
    ],
  );
  useEffect(() => {
    if (viewport) onViewportChangeRef.current?.(viewport);
  }, [viewport]);
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
