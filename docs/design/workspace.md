# Workspace design rationale

This document owns current non-local rationale for the `workspace` module. Public composition and
API usage remain in `packages/workspace/README.md`. Accepted reference and parity records under
`docs/evidence` are historical evidence rather than implementation authority.

## Host and document authority

One `WorkspaceHost` is the lifetime boundary for one workspace. Registries, stores, listeners,
DOM roots, and runtime participants belong to that host. Package operations receive the host
explicitly or resolve it from `WorkspaceProvider`; there is no current or default global host.
DOM-root registration exists only to route document-level events back to their owning host,
including portaled package surfaces.

`WorkspaceDocument` is the canonical serializable authority for sections, item trees, top-level
geometry, viewport, and selection. Appearance, menus, drag sessions, completion services,
diagnostics, shell view state, and windowing state remain host-owned runtime or view inputs. A
section kind parses package- or host-owned data once when a document enters the package. Opaque
host data is validated for serializability and otherwise remains uninterpreted.

Every complete document replacement validates all cross-resource invariants before the first
store write. Internal publication stages the document, node geometry, and selection together so a
synchronous read triggered while the individual stores publish still observes one coherent next
state. Subscribers are notified only after that state is committed. A subscriber must schedule
any reaction that writes back; synchronous mutation from inside publication is rejected.

`loadDocument` is the external lifecycle boundary. In addition to replacing canonical state, it
reapplies or fits the camera, ends active drag modes, and releases outgoing menu focus. The
application-projection boundary `commitWorkspaceDocument` performs the same complete validation
and atomic publication without those external-load lifecycle resets. Partial store writes are not
an alternate document API.

## Extension and mutation boundaries

Registration calls replace one complete host-owned catalog. Candidate section kinds, commands,
creation commands, key bindings, toolbar contributions, and nonserializable item handlers are
validated against the catalogs they reference before any replacement becomes visible. This keeps
menus, headers, the Inspector, the toolbar, and keyboard dispatch on one command definition and
prevents a registration from stranding a contribution or binding.

Package mutations validate the complete request, construct one next canonical value, and publish
once. Coupled resources such as a section forest, item tree, selection, and derived node geometry
move through the same boundary. Browser objects, provider callbacks, file operations, and other
nonserializable effects cross explicit registries and never enter `WorkspaceDocument`.

## Navigator discovery boundary

Global Find and the command palette share one `WorkspaceNavigator` presentation while retaining
separate authorities. Its open mode, query, highlighted result, status, opener, and mounted-surface
count are ephemeral runtime keyed by `WorkspaceHost`. A mounted surface registers its availability,
so default navigator chords decline without consuming browser behavior when a host has not enabled
the feature. The portaled modal is registered as a DOM root of that host for event ownership and
carries the opener's text direction; close restores the opener unless a successful item reveal has
already transferred focus.

Find is an on-demand read projection of the validated canonical document. Section name and kind
and built-in item labels are package-owned search inputs. Opaque section or custom-item data enters
the index only through the owning section kind's synchronous searchable-text callbacks, which
receive detached deeply frozen snapshots. The package does not walk arbitrary data, code, files,
diagnostics, providers, or secrets. Empty-query order follows canonical section and item order;
fuzzy ranks use that order as their tie-break. Item reveal uses a host-scoped registry of mounted
rows, then scrolls, focuses, and transiently emphasizes the live row. It never queries global ids,
changes selection, clears a local filter, or unminimizes content; unavailable visibility is a typed
status at the presentation boundary.

The palette projects the existing command and creation catalogs. `palette` command surfaces and
their optional keywords are validated in the same atomic catalog replacement as every other
surface. Pane, active-section, and sole-selected-item contexts are derived from live state when
entries render and again when one runs. A changed capability, disabled explanation, removed target,
or replaced catalog therefore wins over the displayed snapshot. Creation entries keep the creation
registry as their owner and execute through the existing empty-space placement and atomic insertion
funnel. The navigator owns discovery and accessibility only; command effects, provider work, and
document mutations remain with their existing authorities.

## Controlled editor invariants

The built-in Text and Code sections share one controlled CodeMirror assembly. A keystroke commits
the value that the editor already contains, so unrelated workspace publications do not replace its
document or discard cursor, selection, scroll, focus, and local undo state.

A generated document carries one explicit protected range. User transactions map that range with
their accepted edits; a host replacement supplies its own next text and range together and is not
mapped through itself. Any user transaction touching the protected range is rejected as a whole,
including undo and redo, so an edit cannot partially cross the ownership boundary.

Host-originated whole-document synchronization is excluded from CodeMirror history. CodeMirror
history may replay its own transaction with filtering disabled. Recording a host replacement would
therefore allow a later undo to restore superseded generated text while bypassing the protected
range filter and leaving the editor with a range that no longer describes its document. Existing
user history is mapped through the synchronization and later user edits remain undoable.

Completion is opt-in through the registered Code-section provider. The implicit completion source
from the React wrapper remains disabled. Each canvas owns one tooltip parent inside its transformed
scene and outside section clipping, keyed by host so two mounted canvases cannot share or steal a
completion surface.

Stateful third-party adapters retain their required identity boundaries. In particular, dropdown
choice groups and their selected objects are rebuilt only when host props change; rebuilding them
on every Downshift dispatch would make its controlled selection resynchronize indefinitely.

## Stylesheet and artifact boundary

The package delivers one self-contained stylesheet and does not import dependency CSS from its
runtime entry. Tailwind Preflight remains disabled globally. The subset required by package-owned
elements is scoped beneath the package root marker, including portaled roots, at zero specificity.
Native resets that would alter host-rendered controls apply only to marked package-owned controls.

Section placement and nested item-grid rules remain unlayered after the Tailwind layers. These
rules are required even when their class vocabulary appears only in host-rendered or registered
content; keeping them outside a content-scanned layer prevents artifact tree-shaking. Their cascade
position also keeps the named grids authoritative over retained utility tokens. Built-artifact
checks verify the resulting selectors because source class assertions cannot prove that consumers
receive the rules.

KaTeX presentation is folded into the compiled sheet after Tailwind so its layout outranks the
surrounding typography. Every rule is scoped to the workspace; KaTeX's document-level equation
counter reset becomes a per-workspace reset. Font faces retain only their WOFF2 source and are
inlined, avoiding dependency font resolution and redundant encodings. The build resolves KaTeX
from the workspace manifest, making that exact declared dependency the stylesheet source.

The ESM artifact bundles package-relative modules and leaves declared bare dependencies external.
The package-boundary check owns the emitted import list, exports-only manifest, scoped stylesheet
markers, and absence of dependency CSS.

## Verification harnesses

The packed-consumer harness materializes a temporary unrelated application from the freshly packed
artifact, installs it under repository supply-chain controls, and builds it through public exports
and the compiled stylesheet only. It is an artifact contract suite rather than a routine source
lint.

The production performance profile uses the deterministic 256-section playground route and records
initial render, sustained panning, and drag behavior. Timing is machine-local evidence, never a
portable CI threshold. Fixture drift, missing gesture work, browser errors, and host-page scrolling
remain hard failures so a faster incomplete interaction cannot report success.
