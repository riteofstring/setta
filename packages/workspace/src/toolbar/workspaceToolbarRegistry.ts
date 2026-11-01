import { listWorkspaceCommands } from "../commands/workspaceCommandRegistry.js";
import { getWorkspaceCreationCommands } from "../context-menu/creationCommandStore.js";
import {
  assertWorkspaceToolbarContributions,
  createWorkspaceToolbarCommandCatalog,
  setWorkspaceToolbarContributions,
} from "./workspaceToolbarContributions.js";
import type { WorkspaceToolbarContribution } from "./workspaceToolbarTypes.js";
import type { WorkspaceHost } from "../workspaceHost.js";

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
