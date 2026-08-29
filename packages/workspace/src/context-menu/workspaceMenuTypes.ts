import type { ComponentType } from "react";
import type { WorkspaceCommandIconProps } from "../commands/workspaceCommandTypes";
import type { Position, WorkspaceSectionInput } from "../document/types";

// Creation commands are the pane menu's catalog of new sections rather than actions over existing
// workspace state: they are searched and grouped, and they produce a section instead of running
// against a target. Actions over existing state belong to the command registry.
export type WorkspaceCreationContext = Readonly<{
  // Where on the canvas the section was asked for, and null when the request carried no pointer.
  // A chord names the section to create but no place to put it, and the package resolves the
  // empty space it lands in once the command has built it.
  workspacePosition: Readonly<Position> | null;
}>;

export type WorkspaceCreationCommand = {
  id: string;
  label: string;
  group: string;
  // The chord this command answers to, in the workspace chord vocabulary. A command without one
  // is reachable from the pane menu only; a host rebinds or unbinds it through
  // `registerWorkspaceKeyBindings` under this command's id, the same way it rebinds a package
  // operation. The reference ships "N", "G", and "Ctrl + `" for its own three creation actions.
  chord?: string | null;
  icon?: ComponentType<WorkspaceCommandIconProps>;
  isDisabled?: (context: WorkspaceCreationContext) => boolean;
  createSection: (context: WorkspaceCreationContext) => WorkspaceSectionInput;
};
