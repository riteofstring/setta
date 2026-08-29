import type { ComponentType } from "react";
import type { WorkspaceCommandIconProps } from "../commands/workspaceCommandTypes";

// Where a contributed group sits in the toolbar column, named for the package group it comes
// before rather than for a screen edge, so the order survives direction and orientation. The
// reference splits its contributed controls into three bands around the same two package groups;
// two of those bands are adjacent with no package control between them, which would only put a
// second divider between contributed controls, so the package offers the two anchors its own
// groups create.
export type WorkspaceToolbarPlacement = "before-viewport" | "before-minimap";

type WorkspaceToolbarContributionBase = {
  // The package paints every toolbar control, so a contribution supplies the icon and nothing
  // else about appearance. The command it names owns the label, the disabled state, the toggle
  // state, and the work.
  icon: ComponentType<WorkspaceCommandIconProps>;
  placement: WorkspaceToolbarPlacement;
  // Tooltip content, defaulting to the command's label — the reference's `description ?? label`.
  description?: string;
};

// A contribution names a command in one of the package's two public command vocabularies: the
// command registry's pane-scope actions, and the creation catalog's new sections. The kind says
// which, so a host that reuses one id in both vocabularies still gets the control it asked for.
export type WorkspaceToolbarContribution = WorkspaceToolbarContributionBase & {
  kind: "command" | "creation";
  commandId: string;
};
