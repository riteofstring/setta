import type { ReactNode } from "react";
import { IntegratedWorkspaceWindowManager } from "../windowing/IntegratedWorkspaceWindowManager.js";
import {
  WorkspaceWindowingContextProvider,
  type WorkspaceShellWindowingConfiguration,
} from "../windowing/workspaceWindowingContext.js";
import type { WorkspaceWindowBoundaryInsets } from "../windowing/windowingTypes.js";

type WorkspaceShellWindowingCompositionProps = {
  boundaryInsets: WorkspaceWindowBoundaryInsets | null;
  children: ReactNode;
  windowing: WorkspaceShellWindowingConfiguration | undefined;
};

type WorkspaceShellWindowManagerLayerProps = {
  bottomInset: number;
  windowManager: ReactNode | undefined;
  windowing: WorkspaceShellWindowingConfiguration | undefined;
};

type WorkspaceShellWindowManagerInputs = Omit<
  WorkspaceShellWindowManagerLayerProps,
  "bottomInset"
>;

export function assertWorkspaceShellWindowingConfiguration({
  windowManager,
  windowing,
}: WorkspaceShellWindowManagerInputs): void {
  if (windowManager !== undefined && windowManager !== null && windowing) {
    throw new Error(
      "WorkspaceShell accepts either windowManager or integrated windowing, not both.",
    );
  }
}

function resolveWorkspaceShellWindowManager({
  windowManager,
  windowing,
}: WorkspaceShellWindowManagerInputs): ReactNode {
  return windowing ? <IntegratedWorkspaceWindowManager /> : windowManager;
}

export function WorkspaceShellWindowingComposition({
  boundaryInsets,
  children,
  windowing,
}: WorkspaceShellWindowingCompositionProps) {
  return windowing ? (
    <WorkspaceWindowingContextProvider
      boundaryInsets={boundaryInsets}
      configuration={windowing}
    >
      {children}
    </WorkspaceWindowingContextProvider>
  ) : (
    children
  );
}

export function WorkspaceShellWindowManagerLayer({
  bottomInset,
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
  const layerInsets =
    windowing || bottomInset === 0
      ? { inset: 0 }
      : { insetBlockEnd: bottomInset, insetBlockStart: 0, insetInline: 0 };
  return (
    <div
      data-workspace-shell-window-manager="true"
      style={{
        ...layerInsets,
        pointerEvents: "none",
        position: "absolute",
        zIndex: 25,
      }}
    >
      {resolvedWindowManager}
    </div>
  );
}
