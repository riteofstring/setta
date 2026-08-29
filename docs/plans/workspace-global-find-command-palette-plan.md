# Workspace global find and command palette implementation plan

## Outcome

`@setta/workspace` will provide one optional, host-scoped navigator with `find` and `commands`
modes. Downstream applications can enable the integrated surface through `WorkspaceShell`, mount
the public navigator in a custom composition, and open either mode through explicit host APIs or
configurable workspace key bindings.

Find will search the current validated workspace document. Commands will project the existing
package and host command catalogs plus creation commands. Navigator state will remain ephemeral;
accepted document mutations will continue through the existing authoritative command and creation
funnels.

## Current boundaries

- `WorkspaceDocument` remains the only serializable authority for sections, item trees, top-level
  geometry, viewport, and selection.
- `WorkspaceHost` remains the lifetime and isolation boundary for navigator state, registered
  commands, section kinds, DOM roots, and key bindings.
- Registered section data is opaque. The package indexes section names and built-in item labels;
  additional opaque data enters search only through explicit synchronous section-kind callbacks.
- The command registry remains the owner of labels, applicability, disabled explanations, checked
  state, status messages, and execution. The palette adds a presentation surface, not a parallel
  command implementation.
- The creation registry remains the owner of section creation. Palette creation uses the same
  empty-space placement and atomic insertion path as keyboard creation.
- Network, filesystem, provider, and persistence work remains in downstream command callbacks.

## Public contract

### Navigator composition

Add a public `WorkspaceNavigator` component and a `navigator` configuration on `WorkspaceShell`.
The configuration is optional; its presence enables the integrated navigator and may show the
package trigger. Custom compositions mount `WorkspaceNavigator` directly.

Add explicit host operations:

- `openWorkspaceNavigator(host, "find" | "commands")`
- `closeWorkspaceNavigator(host)`

The package supplies default configurable bindings:

- `workspace.open-find`: `Mod + P`
- `workspace.open-command-palette`: `Mod + Shift + P`

The existing `workspace.focus-item-filter` and `Mod + K` behavior remains section-local.

### Find extension seam

Add an optional `getSectionSearchableText` callback to ordinary registered section kinds. It
receives a detached frozen section snapshot containing the section identity, kind, name, and opaque
data and returns one string. Existing `getItemSearchableText` continues to own custom item text.

The package indexes:

- section name and kind;
- optional section-kind searchable text;
- built-in item labels;
- custom item text returned by the existing callback.

It does not infer or index scalar values, code bodies, secrets, files, diagnostics, or arbitrary
opaque data.

### Command palette extension seam

Add `palette` to `WorkspaceCommandSurface` for pane, section, and item commands. Add validated
optional command `keywords`. A host opts a command into discovery by including `palette` in its
surfaces. Package commands choose their own palette visibility.

Creation commands appear automatically in a `Create` group using their registered labels, groups,
icons, disabled state, and resolved key bindings. Palette command context is resolved from live
state when the surface renders and again when an entry runs:

- pane commands receive a null workspace position;
- section commands receive the primary active section plus every active section;
- item commands receive a single selected item when exactly one active section owns exactly one
  selected item.

Inapplicable commands are omitted. Applicable disabled commands remain visible with their existing
disabled explanation. No stale palette snapshot can run against removed sections or items.

## Find behavior

Find entries are deterministic discriminated values for sections and items. Each entry has a
stable id, label, searchable text, and breadcrumb derived from canonical parent order. Query
matching reuses the package's exact-pinned `match-sorter` dependency. Empty queries show document
order; non-empty queries use match rank with document order as the stable tie-break.

Activating a section result closes the navigator and uses `focusWorkspaceSection`. Activating an
item result focuses its section, scrolls a mounted visible item row into view, focuses that row,
and applies package-owned transient emphasis. It does not change canonical selection, clear a
section-local filter, unminimize a section, or synthesize a document mutation. A result that cannot
currently be revealed stays actionable at the section level and announces the specific visibility
reason.

The item reveal path will use a host-scoped registry populated by mounted item rows. It will not
query global DOM ids or reach across workspace hosts.

## Navigator interaction and accessibility

The navigator is a modal dialog scoped to its workspace host and rendered outside the transformed
canvas. It restores focus to the opener on close and provides:

- explicit Find and Commands tabs;
- a labelled combobox input and grouped listbox results;
- Arrow Up/Down, Home/End, Enter, and Escape behavior;
- current resolved shortcut labels;
- visible disabled reasons and an accessible live status;
- viewport-bounded compact and wide layouts;
- light, dark, RTL, coarse-pointer, reduced-motion, and package focus-visible behavior.

Opening and querying do not publish `WorkspaceDocument`. Document changes rebuild results from the
new canonical snapshot without retaining removed targets.

## Implementation sequence and commit checkpoints

### 1. Pure find and reveal domain

- Add navigator result types, document traversal, breadcrumb construction, matching, and validation.
- Add the section searchable-text registration boundary.
- Add the host-scoped mounted-item reveal registry and item-row registration.
- Cover nested sections, nested items, opaque search callbacks, duplicate labels, empty queries,
  deterministic ordering, filtered/unmounted items, multi-host isolation, and disposal.
- Commit the coherent domain boundary.

### 2. Palette model and registrations

- Extend command surfaces and validated keyword metadata.
- Build live pane, section, and item palette contexts.
- Project package/host commands and creation commands without duplicating their behavior.
- Resolve current key binding labels and revalidate targets at activation.
- Cover applicability, disabled reasons, checked commands, creation placement, selection changes,
  removals while open, duplicate labels, and host isolation.
- Commit the coherent action catalog.

### 3. Runtime state, UI, and shell composition

- Add one host-scoped navigator runtime and public open/close operations.
- Build the accessible dialog, mode tabs, query input, grouped results, result activation, status,
  focus restoration, and trigger.
- Add default key bindings and shell/custom-composition integration.
- Add scoped compiled styles and public exports.
- Demonstrate downstream registration and both modes in the playground.
- Cover keyboard, pointer, focus, compact layout, dark mode, live document updates, command
  execution, and standalone composition.
- Commit the integrated feature.

### 4. Verification and delivery cleanup

- Run focused workspace and playground tests while editing.
- Run `code-polishy test --changed` for the full changed boundary.
- Update the current workspace design rationale and public README with ownership and usage.
- Remove obsolete navigator/search wording, duplicate helpers, and superseded tests discovered by
  the implementation.
- Delete this temporary plan after every planned item is implemented and verified.
- Run formatting, policy checks selected by Code Polishy, and one final merge gate against `main`.
- Commit the durable documentation and plan removal as the final coherent checkpoint.

## Acceptance criteria

- Two workspace hosts can open, search, navigate, and execute independently.
- Find returns every reachable section and item exactly once in deterministic order.
- Opaque data enters search only through the registered owner callback.
- Palette entries are generated from registered command and creation authorities.
- Disabled and stale targets never execute and explain why.
- Opening, closing, mode changes, queries, highlighting, and navigation do not publish the document.
- Accepted package mutations publish through their existing single atomic boundary.
- Default shortcuts respect editable targets, host root routing, downstream rebinding, and conflict
  detection.
- The packed public artifact exports the navigator API and contains its scoped styles.
- README examples are sufficient for an unrelated downstream React application to enable and extend
  both modes.
- The temporary plan is absent from the final tree and the worktree is clean after the final commit.
