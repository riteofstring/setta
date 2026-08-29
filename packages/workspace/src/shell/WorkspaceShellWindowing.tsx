import type { ReactNode } from "react";
import {
  IntegratedWorkspaceWindowManager,
  WorkspaceWindowingContextProvider,
  type WorkspaceShellWindowingConfiguration,
} from "../windowing/workspaceWindowingContext";

type WorkspaceShellWindowingCompositionProps = {
  children: ReactNode;
  windowing: WorkspaceShellWindowingConfiguration | undefined;
};

type WorkspaceShellWindowManagerLayerProps = {
  windowManager: ReactNode | undefined;
  windowing: WorkspaceShellWindowingConfiguration | undefined;
};

export function assertWorkspaceShellWindowingConfiguration({
  windowManager,
  windowing,
}: WorkspaceShellWindowManagerLayerProps): void {
  if (windowManager !== undefined && windowManager !== null && windowing) {
    throw new Error(
      "WorkspaceShell accepts either windowManager or integrated windowing, not both.",
    );
  }
}

function resolveWorkspaceShellWindowManager({
  windowManager,
  windowing,
}: WorkspaceShellWindowManagerLayerProps): ReactNode {
  return windowing ? <IntegratedWorkspaceWindowManager /> : windowManager;
}

export function WorkspaceShellWindowingComposition({
  children,
  windowing,
}: WorkspaceShellWindowingCompositionProps) {
  return windowing ? (
    <WorkspaceWindowingContextProvider configuration={windowing}>
      {children}
    </WorkspaceWindowingContextProvider>
  ) : (
    children
  );
}

export function WorkspaceShellWindowManagerLayer({
  windowManager,
  windowing,
}: WorkspaceShellWindowManagerLayerProps) {
  const resolvedWindowManager = resolveWorkspaceShellWindowManager({
    windowManager,
    windowing,
  });
  if (resolvedWindowManager === undefined || resolvedWindowManager === null) {
    return null;
  }
  return (
    <div
      data-workspace-shell-window-manager="true"
      style={{
        inset: 0,
        pointerEvents: "none",
        position: "absolute",
        zIndex: 25,
      }}
    >
      {resolvedWindowManager}
    </div>
  );
}
