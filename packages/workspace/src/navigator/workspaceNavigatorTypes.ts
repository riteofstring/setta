import type { ComponentType } from "react";
import type { WorkspaceCommandIconProps } from "../commands/workspaceCommandTypes.js";

const WORKSPACE_NAVIGATOR_MODES = ["find", "commands"] as const;

export type WorkspaceNavigatorMode = (typeof WORKSPACE_NAVIGATOR_MODES)[number];

export type WorkspaceNavigatorConfiguration = Readonly<{
  defaultMode?: WorkspaceNavigatorMode;
  showTrigger?: boolean;
}>;

export type WorkspaceNavigatorProps = WorkspaceNavigatorConfiguration & {
  ariaLabel?: string;
  className?: string;
};

export type WorkspaceNavigatorState = Readonly<{
  activeIndex: number;
  isOpen: boolean;
  mode: WorkspaceNavigatorMode;
  opener: HTMLElement | null;
  query: string;
  statusMessage: string | null;
}>;

export type WorkspaceNavigatorActivation = Readonly<{
  ran: boolean;
  statusMessage: string | null;
}>;

export type WorkspaceNavigatorEntry = Readonly<{
  breadcrumb: string | null;
  checked: boolean | null;
  disabled: boolean;
  disabledReason: string | null;
  group: string;
  icon?: ComponentType<WorkspaceCommandIconProps>;
  id: string;
  kind: "command" | "item" | "section";
  label: string;
  shortcutLabel: string | null;
  activate: () => WorkspaceNavigatorActivation;
}>;
