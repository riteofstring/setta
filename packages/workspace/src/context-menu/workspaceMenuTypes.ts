import type { ComponentType } from "react";
import type { WorkspaceCommandIconProps } from "../commands/workspaceCommandTypes";
import type { Position, WorkspaceSectionInput } from "../document/types";

export type WorkspaceCreationContext = Readonly<{
  workspacePosition: Readonly<Position> | null;
}>;

export type WorkspaceCreationCommand = {
  id: string;
  label: string;
  group: string;

  chord?: string | null;
  icon?: ComponentType<WorkspaceCommandIconProps>;
  isDisabled?: (context: WorkspaceCreationContext) => boolean;
  createSection: (context: WorkspaceCreationContext) => WorkspaceSectionInput;
};
