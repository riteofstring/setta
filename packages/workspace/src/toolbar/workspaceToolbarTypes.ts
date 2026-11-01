import type { ComponentType } from "react";
import type { WorkspaceCommandIconProps } from "../commands/workspaceCommandTypes.js";

export type WorkspaceToolbarPlacement = "before-viewport" | "before-minimap";

type WorkspaceToolbarContributionBase = {
  icon: ComponentType<WorkspaceCommandIconProps>;
  placement: WorkspaceToolbarPlacement;

  description?: string;
};

export type WorkspaceToolbarContribution = WorkspaceToolbarContributionBase & {
  kind: "command" | "creation";
  commandId: string;
};
