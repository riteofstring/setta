import type { ReactNode } from "react";
import {
  IntegratedWorkspaceWindowManager,
  WorkspaceWindowingContextProvider,
  type WorkspaceShellWindowingConfiguration,
} from "../windowing/workspaceWindowingContext";

type WorkspaceShellWindowingCompositionProps = {
  bottomInset: number;
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

function addWorkspaceShellBottomInset(
  windowing: WorkspaceShellWindowingConfiguration | undefined,
  bottomInset: number,
): WorkspaceShellWindowingConfiguration | undefined {
  if (!Number.isFinite(bottomInset) || bottomInset < 0) {
    throw new Error(
      "Workspace shell window-manager bottom inset must be finite and non-negative.",
    );
  }
  if (!windowing || bottomInset === 0) {
    return windowing;
  }
  return {
    ...windowing,
    viewport: {
      ...windowing.viewport,
      insets: {
        ...windowing.viewport.insets,
        bottom: windowing.viewport.insets.bottom + bottomInset,
      },
    },
  };
}

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
  bottomInset,
  children,
  windowing,
}: WorkspaceShellWindowingCompositionProps) {
  const resolvedWindowing = addWorkspaceShellBottomInset(
    windowing,
    bottomInset,
  );
  return resolvedWindowing ? (
    <WorkspaceWindowingContextProvider configuration={resolvedWindowing}>
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
