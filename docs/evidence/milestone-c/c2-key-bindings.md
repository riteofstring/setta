# C2 key bindings design record — structural and parameter operations

Recorded with the first C2 batch. Frozen main binds these operations through its application
shortcut engine and its settings store; the package has neither, so the binding model below is
package design authorized by C2 of `docs/plans/setta-workspace-extraction-plan.md`. The chords
themselves are main's shipped defaults.

## Model

- **A binding names one workspace operation.** Bindings for the structural commands use the command
  id, so the chord runs the same command the section context menu, header menu, Outline row menu,
  and Inspector run, against the active section selection. The parameter moves are not commands
  (they act on the selected items directly), so they carry their own ids.
- **Chords are parsed, not matched textually.** `Mod` is Meta on macOS and Control elsewhere, keys
  compare as event codes, and the whole pressed-key set must match — the reference's rule, now
  shared by the held interaction gestures so both read one vocabulary.
- **Host registration replaces the complete set**, like commands, section kinds, and item handlers.
  A binding a host does not name keeps its default chord; `chord: null` unbinds an operation so the
  host can keep that chord for itself.
- **Conflicts are found before activation.** `getWorkspaceKeyBindingConflicts` answers for a
  candidate set without registering it, and registration throws with the same information. Two
  bindings on one chord conflict, and so does a chord a held gesture owns.
- **Labels are per platform.** Each binding reports its operation's own label and the chord written
  for the platform it is read on, so a host lists shortcuts without repeating them.

## Package-only decisions

- **An unavailable command hands its chord back to the browser.** The reference's engine suppresses
  the browser default for every chord it recognizes. A command binding suppresses it only when the
  command actually ran — the accepted A1 ungroup behavior, now the rule for every command binding.
  The parameter moves keep the reference's behavior because they decline on where the caret is, not
  on what the document holds, and the caret must not act on the chord either.
- **Locking ships bindable and unbound.** Main has no lock shortcut, so the package invents no
  chord; `workspace.lock-sections` and `workspace.unlock-sections` are bindable and a host chooses.
  The playground binds them to `Mod + Alt + L` and `Mod + Alt + U`.
- **An unusable chord fails at registration.** Main title-cases an unknown key name into a code that
  can never match; the package rejects it instead.
- **Chord labels are rendered from the parse** in one order (Mod, Ctrl, Alt, Shift, keys), with only
  Mod platform-substituted as main's `shortcutPrettified` does. One binding therefore reads the same
  however a host spelled its chord.
- **Held gestures cannot be rebound away.** Marquee, multi-selection and zoom activation, pan,
  free and sorting parameter drags, parameter selection, quick info and its page/copy/freeze chords,
  and Escape are reserved: they release with their keys instead of running an operation, and a host
  binding that names one of their chords is refused.
- **Indent and unindent keep their guards on any chord.** Main applies the `[data-tab-native]`
  opt-out and the filter suspension only while those operations sit on Tab. The package keeps them
  with the operation, so a host that moves indentation elsewhere gets the same behavior.
- **Bindings name package operations only.** A host command runs from the menus, the Inspector, and
  the Outline; giving host commands chords requires binding registration and command registration to
  validate each other, and is deliberately left out of this batch.

## Deliberate consequences for the acceptance gate

- `Backspace` now deletes the active section selection, and `Mod + G` groups it. Both are reference
  defaults the package did not have; `Backspace` stands down inside any editor, and `Mod + G` leaves
  the chord to the browser whenever the selection cannot be grouped.
- `Shift + Mod + G`, `Alt + ArrowUp`, `Alt + ArrowDown`, `Tab`, and `Shift + Tab` behave exactly as
  accepted; they are now configurable rather than fixed.
- The playground's Guide panel lists every binding with its chord for the running platform, and its
  Test actions menu reports what a host learns when it asks about a conflicting chord.

## Remaining C2 work

Fit, reset and zoom, section creation, select all, next and previous top-level section, and
pane/Outline focus need package operations that do not exist yet. They land in the next C2 batch
with their reference chords (`F`, `Mod + Comma`, `Equal`, `Minus`, `Z`, `N`, `G`, `Mod + A`,
`Mod + Shift + A`, `Alt + J`, `Alt + K`, and `Ctrl + Shift + 1`–`4`).
