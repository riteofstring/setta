import type { WorkspaceCreationCommand } from "./workspaceMenuTypes";
import type { WorkspaceHost } from "../workspaceHost";

// The registered creation catalog on its own, so the pane menu that renders it and the key
// binding registry that binds its chords can both read it without either owning the other.
// `workspaceMenuRegistry.ts` owns validation and the public registration entry.
const commandsByHost = new WeakMap<
  WorkspaceHost,
  ReadonlyArray<WorkspaceCreationCommand>
>();

export function getWorkspaceCreationCommands(
  host: WorkspaceHost,
): ReadonlyArray<WorkspaceCreationCommand> {
  return commandsByHost.get(host) ?? [];
}

export function setWorkspaceCreationCommands(
  host: WorkspaceHost,
  commands: ReadonlyArray<WorkspaceCreationCommand>,
): void {
  commandsByHost.set(host, commands);
}
