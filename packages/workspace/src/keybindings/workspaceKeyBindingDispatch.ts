import { getIsEditableTarget } from "./editableTarget";
import { matchesWorkspaceChord } from "./workspaceChords";
import {
  getResolvedWorkspaceKeyBindings,
  type ResolvedWorkspaceKeyBinding,
} from "./workspaceKeyBindingRegistry";
import type { WorkspaceHost } from "../workspaceHost";

function runMatchedBinding(
  event: KeyboardEvent,
  binding: ResolvedWorkspaceKeyBinding,
): void {
  const repeatBlocked = event.repeat && !binding.definition.allowRepeat;
  const ran = repeatBlocked ? false : binding.definition.run(event);
  if (
    ran ||
    (binding.definition.keepsChordWhenDeclined &&
      binding.suppressesBrowserDefault)
  ) {
    event.preventDefault();
  }
}

export function runWorkspaceKeyBindings(
  host: WorkspaceHost,
  event: KeyboardEvent,
  macOS: boolean,
  heldKeysEqual: (codes: ReadonlyArray<string>) => boolean,
): void {
  for (const binding of getResolvedWorkspaceKeyBindings(host, macOS)) {
    if (!matchesWorkspaceChord(event, binding.chord, macOS, heldKeysEqual)) {
      continue;
    }
    if (binding.yieldsToEditableTarget && getIsEditableTarget(event)) {
      return;
    }
    runMatchedBinding(event, binding);
    return;
  }
}
