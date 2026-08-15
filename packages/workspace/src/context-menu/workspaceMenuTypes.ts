import type { ComponentType } from "react";
import type { WorkspaceCommandIconProps } from "../commands/workspaceCommandTypes";
import type { Position, WorkspaceSectionInput } from "../document/types";

// Creation commands are the pane menu's catalog of new sections rather than actions over existing
// workspace state: they are searched and grouped, and they produce a section instead of running
// against a target. Actions over existing state belong to the command registry.
export type WorkspaceCreationContext = Readonly<{
  workspacePosition: Readonly<Position>;
}>;

export type WorkspaceCreationCommand = {
  id: string;
  label: string;
  group: string;
  icon?: ComponentType<WorkspaceCommandIconProps>;
  isDisabled?: (context: WorkspaceCreationContext) => boolean;
  createSection: (context: WorkspaceCreationContext) => WorkspaceSectionInput;
};
