import type { WorkspaceCreationCommand } from "../context-menu/workspaceMenuTypes.js";
import { createWorkspaceSectionFromCommand } from "../section/createSectionAction.js";
import type { WorkspaceKeyBindingDefinition } from "./builtInWorkspaceKeyBindings.js";
import type { WorkspaceHost } from "../workspaceHost.js";

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
