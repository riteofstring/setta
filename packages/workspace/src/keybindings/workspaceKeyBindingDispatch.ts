import { getIsEditableTarget } from "./editableTarget";
import { matchesWorkspaceChord } from "./workspaceChords";
import {
  getResolvedWorkspaceKeyBindings,
  type ResolvedWorkspaceKeyBinding,
} from "./workspaceKeyBindingRegistry";

// One keydown pass over the bound workspace operations. Registration guarantees at most one
// binding answers to a chord, so the first match decides the keypress:
//
// - inside an editable control, a binding whose chord is a native editing chord stands down and
//   the caret keeps the keypress;
// - an auto-repeat keydown re-runs only the operations that accept repeats;
// - the browser default is suppressed when the operation ran, and otherwise only for a binding
//   that owns its chord even while declining.
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
  event: KeyboardEvent,
  macOS: boolean,
  heldKeysEqual: (codes: ReadonlyArray<string>) => boolean,
): void {
  for (const binding of getResolvedWorkspaceKeyBindings(macOS)) {
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
