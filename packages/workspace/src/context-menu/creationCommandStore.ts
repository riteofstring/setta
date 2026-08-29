import type { WorkspaceCreationCommand } from "./workspaceMenuTypes";
import type { WorkspaceHost } from "../workspaceHost";

const commandsByHost = new WeakMap<
  WorkspaceHost,
  ReadonlyArray<WorkspaceCreationCommand>
>();

export function getWorkspaceCreationCommands(
  host: WorkspaceHost,
): ReadonlyArray<WorkspaceCreationCommand> {
  return commandsByHost.get(host) ?? [];
}

export function getWorkspaceCreationCommand(
  host: WorkspaceHost,
  id: string,
): WorkspaceCreationCommand | null {
  return (
    getWorkspaceCreationCommands(host).find((command) => command.id === id) ??
    null
  );
}

export function setWorkspaceCreationCommands(
  host: WorkspaceHost,
  commands: ReadonlyArray<WorkspaceCreationCommand>,
): void {
  commandsByHost.set(host, commands);
}
