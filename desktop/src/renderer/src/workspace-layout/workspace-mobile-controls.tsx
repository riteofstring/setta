import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Settings,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { ComponentType, ReactNode } from "react";

type PaneDirection = "up" | "down" | "left" | "right";

const directionPadButtons = [
  { direction: "left", Icon: ArrowLeft, label: "Focus pane to the left" },
  { direction: "up", Icon: ArrowUp, label: "Focus pane above" },
  { direction: "down", Icon: ArrowDown, label: "Focus pane below" },
  { direction: "right", Icon: ArrowRight, label: "Focus pane to the right" },
] satisfies Array<{
  direction: PaneDirection;
  Icon: ComponentType<{ className?: string }>;
  label: string;
}>;

export function WorkspaceMobileControls({
  moveFocus,
  onNewPane,
  onOpenSettingsPane,
  onToggleOverview,
  onToggleProjectPane,
  overviewActive,
  projectPaneOpen,
}: {
  moveFocus: (direction: PaneDirection) => void;
  onNewPane: () => void;
  onOpenSettingsPane: () => void;
  onToggleOverview: () => void;
  onToggleProjectPane: () => void;
  overviewActive: boolean;
  projectPaneOpen: boolean;
}) {
  const ProjectPaneIcon = projectPaneOpen ? PanelLeftClose : PanelLeftOpen;
  const OverviewIcon = overviewActive ? ZoomIn : ZoomOut;
  return (
    <nav
      aria-label="Workspace pane controls"
      className="workspace-mobile-bar app-no-drag"
      data-testid="workspace-mobile-bar"
    >
      <div aria-label="Move pane focus" className="workspace-mobile-dpad" role="group">
        {directionPadButtons.map(({ direction, Icon, label }) => (
          <WorkspaceMobileButton
            key={direction}
            label={label}
            onClick={() => moveFocus(direction)}
            testId={`workspace-mobile-focus-${direction}`}
          >
            <Icon className="h-4 w-4" />
          </WorkspaceMobileButton>
        ))}
      </div>
      <div className="workspace-mobile-actions">
        <WorkspaceMobileButton
          label={projectPaneOpen ? "Hide project sidebar" : "Show project sidebar"}
          onClick={onToggleProjectPane}
          pressed={projectPaneOpen}
          testId="workspace-mobile-project-toggle"
        >
          <ProjectPaneIcon className="h-4 w-4" />
        </WorkspaceMobileButton>
        <WorkspaceMobileButton
          label="New frame"
          onClick={onNewPane}
          testId="workspace-mobile-new-frame"
        >
          <Plus className="h-4 w-4" />
        </WorkspaceMobileButton>
        <WorkspaceMobileButton
          label={overviewActive ? "Exit overview" : "Enter overview"}
          onClick={onToggleOverview}
          pressed={overviewActive}
          testId="workspace-mobile-overview"
        >
          <OverviewIcon className="h-4 w-4" />
        </WorkspaceMobileButton>
        <WorkspaceMobileButton
          label="Open settings pane"
          onClick={onOpenSettingsPane}
          testId="workspace-mobile-settings"
        >
          <Settings className="h-4 w-4" />
        </WorkspaceMobileButton>
      </div>
    </nav>
  );
}

function WorkspaceMobileButton({
  children,
  label,
  onClick,
  pressed,
  testId,
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  pressed?: boolean;
  testId: string;
}) {
  return (
    <button
      aria-label={label}
      aria-pressed={pressed}
      className="workspace-mobile-button app-no-drag"
      data-testid={testId}
      onClick={onClick}
      onPointerDown={(event) => event.stopPropagation()}
      title={label}
      type="button"
    >
      {children}
    </button>
  );
}
