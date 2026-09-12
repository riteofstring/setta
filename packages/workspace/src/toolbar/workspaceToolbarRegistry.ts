import { listWorkspaceCommands } from "../commands/workspaceCommandRegistry";
import { getWorkspaceCreationCommands } from "../context-menu/creationCommandStore";
import {
  assertWorkspaceToolbarContributions,
  createWorkspaceToolbarCommandCatalog,
  setWorkspaceToolbarContributions,
} from "./workspaceToolbarContributions";
import type { WorkspaceToolbarContribution } from "./workspaceToolbarTypes";
import type { WorkspaceHost } from "../workspaceHost";

export function registerWorkspaceToolbarContributions(
  host: WorkspaceHost,
  contributions: ReadonlyArray<WorkspaceToolbarContribution>,
): void {
  if (!Array.isArray(contributions)) {
    throw new Error("Workspace toolbar contributions must be an array.");
  }
  setWorkspaceToolbarContributions(
    host,
    assertWorkspaceToolbarContributions(
      contributions,
      createWorkspaceToolbarCommandCatalog(
        listWorkspaceCommands(host).map((command) => command.definition),
        getWorkspaceCreationCommands(host),
      ),
    ),
  );
}
