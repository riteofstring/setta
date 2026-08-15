# C1 command registry design record

Recorded with the C1 implementation. These are package-only decisions: frozen main has no command
registry, so none of them is main parity. They are open for developer judgement at the Milestone C
acceptance gate.

## Model

- **Scope decides input, surface decides placement.** A command declares one scope (`pane`,
  `section`, `item`) and the surfaces that may offer it (`context-menu`, `header`, `outline`,
  `inspector`, `inspector-parameters`). Scope/surface combinations that cannot exist — a pane
  command in a section header, an item command in the section action row — fail at registration.
- **Two Inspector surfaces.** `inspector` is the section action row; `inspector-parameters` is the
  parameter action row. They are separate placements, not separate engines, so a host can
  contribute to either row.
- **Applicability versus disabled.** Package commands may declare applicability, which decides
  whether a surface offers them at all; that is what keeps the section-header trigger hidden for
  kinds with no applicable actions. Host commands are always offered on the surfaces they declare
  and explain themselves through `getDisabledReason`, so host code never runs while a surface is
  merely deciding whether to paint a trigger.
- **One explanation, two presentations.** `getDisabledReason` returns the single sentence every
  surface shows. Menus keep their accepted item text and attach the sentence as the item's pointer
  title and accessible description; the Inspector keeps its accepted visible help paragraph and
  prints each distinct reason once per row.
- **Execution revalidates.** Running a command re-checks applicability and the disabled reason
  against live state before it mutates, so a control that goes stale between paint and click does
  nothing instead of running a request the surface would not have offered.
- **Announcements.** A command may declare `getStatusMessage`, evaluated before it runs. Surfaces
  with a live region — the Inspector — announce it. Menus do not announce, matching accepted
  behavior.
- **Reserved ids.** Package command ids use the `workspace.` prefix, and host registration rejects
  that prefix along with duplicate ids, unknown scopes, invalid surfaces, and missing `run`.

## Deliberate consequences for the acceptance gate

- The single-section Inspector now offers `Group` (disabled, with the reason it needs at least two
  selected sections) and `Delete` beside `Ungroup`, because the Inspector section row offers the
  same section commands the section context menu offers. Previously it offered `Ungroup` only.
- `Lock Position & Size` and `Unlock Position & Size` are separate commands whose applicability
  follows the selection's lock state, instead of one entry with a label that flips. Menus look
  unchanged; the ids and labels are now stable for the C2 and C3 surfaces.
- Outline row menus resolve section commands on the `outline` surface. `outline` is no longer a
  command scope, so a host registers a section-scope command and lists the surfaces it wants.
- A header invocation targets its own section: the header context carries that section as the whole
  selection, which is how the accepted "header ungroup belongs to the owning group" behavior is now
  expressed. Host commands on the header surface therefore see the owning section rather than the
  canvas selection.
- `Shift+Mod+G` runs the same `workspace.ungroup-sections` command as every menu and the Inspector,
  and still leaves the chord to the browser whenever that command refuses the active selection.

## Not commands

The Inspector's property editors — name, style accent, tag color, size, and the lock, minimize,
orientation, and bounded-overflow toggles — remain editors of the selection's properties. They call
the same canonical operations the commands call, but they display and edit state rather than invoke
an action, so they stay out of the registry. Section creation likewise stays in the creation-command
catalog: those entries are searched and grouped and produce a new section instead of acting on an
existing target.
