import type { WorkspaceCreationCommand } from "../context-menu/workspaceMenuTypes";
import { createWorkspaceSectionFromCommand } from "../section/createSectionAction";
import type { WorkspaceKeyBindingDefinition } from "./builtInWorkspaceKeyBindings";
import type { WorkspaceHost } from "../workspaceHost";

export function createWorkspaceCreationKeyBinding(
  host: WorkspaceHost,
  command: WorkspaceCreationCommand,
): WorkspaceKeyBindingDefinition {
  return Object.freeze({
    id: command.id,
    defaultChord: command.chord ?? null,
    allowRepeat: false,

    keepsChordWhenDeclined: false,
    getLabel: () => command.label,
    run: () => createWorkspaceSectionFromCommand(host, command),
  });
}
