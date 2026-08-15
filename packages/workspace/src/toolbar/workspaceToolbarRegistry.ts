import { listWorkspaceCommands } from "../commands/workspaceCommandRegistry";
import { getWorkspaceCreationCommands } from "../context-menu/creationCommandStore";
import {
  assertWorkspaceToolbarContributions,
  createWorkspaceToolbarCommandCatalog,
  setWorkspaceToolbarContributions,
} from "./workspaceToolbarContributions";
import type { WorkspaceToolbarContribution } from "./workspaceToolbarTypes";

// Like command, creation, section-kind, and item-handler registration, each call replaces the
// complete host-owned set, and hosts register before mounting the canvas. A contribution that
// names a command neither vocabulary has, that names an action which does not offer the toolbar
// surface, or that repeats a command fails here rather than painting a control that cannot run.
export function registerWorkspaceToolbarContributions(
  contributions: ReadonlyArray<WorkspaceToolbarContribution>,
): void {
  if (!Array.isArray(contributions)) {
    throw new Error("Workspace toolbar contributions must be an array.");
  }
  setWorkspaceToolbarContributions(
    assertWorkspaceToolbarContributions(
      contributions,
      createWorkspaceToolbarCommandCatalog(
        listWorkspaceCommands().map((command) => command.definition),
        getWorkspaceCreationCommands(),
      ),
    ),
  );
}
