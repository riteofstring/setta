import type { WorkspaceCreationCommand } from "../context-menu/workspaceMenuTypes";
import { createWorkspaceSectionFromCommand } from "../section/createSectionAction";
import type { WorkspaceKeyBindingDefinition } from "./builtInWorkspaceKeyBindings";

// A creation command with a chord is a key binding over the package's creation operation, listed,
// rebound, unbound, and conflict-checked exactly like a package operation. Its id is the command's
// own: creation ids cannot contain the dot every package binding id carries, so the two
// vocabularies cannot collide.
export function createWorkspaceCreationKeyBinding(
  command: WorkspaceCreationCommand,
): WorkspaceKeyBindingDefinition {
  return Object.freeze({
    id: command.id,
    defaultChord: command.chord ?? null,
    allowRepeat: false,
    // A creation command the workspace cannot run right now — structural editing off, or the
    // command's own disabled state — hands the chord back to the browser, the rule every command
    // binding follows.
    keepsChordWhenDeclined: false,
    getLabel: () => command.label,
    run: () => createWorkspaceSectionFromCommand(command),
  });
}
