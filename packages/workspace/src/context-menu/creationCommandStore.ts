import type { WorkspaceCreationCommand } from "./workspaceMenuTypes";

// The registered creation catalog on its own, so the pane menu that renders it and the key
// binding registry that binds its chords can both read it without either owning the other.
// `workspaceMenuRegistry.ts` owns validation and the public registration entry.
let registeredCreationCommands: ReadonlyArray<WorkspaceCreationCommand> = [];

export function getWorkspaceCreationCommands(): ReadonlyArray<WorkspaceCreationCommand> {
  return registeredCreationCommands;
}

export function setWorkspaceCreationCommands(
  commands: ReadonlyArray<WorkspaceCreationCommand>,
): void {
  registeredCreationCommands = commands;
}
