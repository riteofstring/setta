# Workspace design rationale

This document owns current non-local rationale for the `workspace` module. Public composition and
API usage remain in `packages/workspace/README.md`. Accepted reference and parity records are
preserved in the [historical evidence archive](../evidence/README.md).

## Host and document authority

One `WorkspaceHost` is the lifetime boundary for one workspace. Registries, stores, listeners,
DOM roots, and runtime participants belong to that host. Package operations receive the host
explicitly or resolve it from `WorkspaceProvider`; there is no current or default global host.
DOM-root registration exists only to route document-level events back to their owning host,
including portaled package surfaces. Held canvas gestures resolve their host from the current
pointer target when it belongs to a registered Workspace surface, then fall back to the focused
host when the pointer is outside every Workspace. Focus continues to own keyboard commands and
editing shortcuts.

Simple stores share a lazy host getter. Each store definition retains its own weak map, so store
identity stays stable within one host and separate across hosts and store definitions. Every lookup
checks the host's active lifetime before returning cached state. Runtimes with listener or timer
cleanup keep that lifecycle with their owning feature.

Applications set the host's structure and layout edit authority through
`setWorkspaceCapabilities`. Read-only presentation remains a configuration of the same host,
shell, canvas, and section projection rather than requiring an application-owned renderer.

`WorkspaceDocument` is the canonical serializable authority for sections, item trees, top-level
geometry, viewport, selection, and optional saved canvas views. Appearance, menus, drag sessions,
completion services, diagnostics, shell view state, and windowing state remain host-owned runtime
or view inputs. A section kind parses package- or host-owned data once when a document enters the
package. Opaque host data is validated for serializability and otherwise remains uninterpreted.
Minimization constrains a section's rendered surface to its header without replacing the section's
authored size; expanding the section restores that size.

Width resizing follows the owning layout. A child climbs through vertically arranged parents,
including application-defined list sections, and applies the same width update as resizing that
ancestor directly. A horizontal parent stops the climb so separate columns remain independent.
Heights belong to individual sections, and every affected section retains its registered size
constraints.

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

## Standalone section projection boundary

The public standalone section surface is a package-owned projection of one canonical section and
the descendant tree that section may own. It shares section lookup, chrome, registered-kind body
rendering, nested layout, descendant saved-view visibility, focus routing, and section drag
behavior with the canvas and managed-window presentations. The requested root always projects.
Its root is registered to the current host so global interaction dispatch remains instance-scoped
even when an application places the surface outside the integrated shell.

The application selects the root section and owns route identifiers, authorization, document
loading and persistence, unavailable states, product providers, and application-specific header
actions. The package does not interpret a route, fetch a document, or navigate between the focused
surface and the canvas. Because registered content may own editor or provider state, one host may
have only one live rendering of a section at a time. A focused route therefore replaces that
section's canvas or managed-window projection rather than duplicating it.

## Private canvas renderer boundary

Workspace uses upstream, exact-pinned `@xyflow/react` as a private, host-scoped canvas renderer.
There is no vendored XYFlow source, fork compatibility layer, or alternate renderer. Upstream
supplies the pane transform, pointer pan and zoom mechanics, node measurement, marquee mechanics,
and top-level node drag mechanics. The adapter projects the current Workspace section and geometry
stores into controlled XYFlow nodes and translates renderer events back through the existing
document, selection, measurement, drag, and history operations. The XYFlow store is a transient
render projection and never becomes document or application authority.

The viewport is initialized through XYFlow's uncontrolled `defaultViewport` path so pointer pan
and zoom update the renderer without putting the full Workspace React tree on the gesture hot
path. Every accepted viewport change is still mirrored synchronously through Workspace's existing
canonical publication boundary. Programmatic fit, saved-view activation, document load, minimap,
and scroll-bridge commands read and update the current host's private renderer instance. Each
mounted `WorkspaceHost` owns a separate instance and registration lifetime.

Managed-window drag and resize geometry stays in an interaction session until pointer release. Pointer
release completes before committed bounds, focus, window actions, or recovery actions are
projected through React, so the pointer target is not reconciled while it still owns the gesture.
Minimap visibility and placement controls follow the same release boundary because they mount or
reposition canvas-owned interaction surfaces.

Workspace remains the presentation owner. It supplies the background and grid, minimap, selection
bounds, section shells and bodies, managed windows, controls, menus, portals, focus treatment, and
all canvas CSS. XYFlow still receives no product edges and renders no product handles or ports;
Workspace renders its controlled graph as a Workspace-native viewport overlay and measures public
ports against the section shells. This is required for nested sections, which are DOM descendants
rather than independent XYFlow nodes. The application owns the complete port, edge, and selected
edge inputs and applies connect, reconnect, delete, and selection callbacks. Those public values
use Workspace types and remain outside `WorkspaceDocument`; XYFlow types, instances, and state stay
absent from the public contract.

New connections use the host's required synchronous connection validator. Replacement validation
may depend on which controlled edge is being replaced, so an optional reconnect validator receives
both that edge ID and the detached candidate connection during hover and drop. Without it,
reconnects retain the new-connection policy. Workspace does not speculate about target occupancy or
mutate the controlled edge set before the host accepts the replacement. A connect or reconnect
gesture survives configuration updates, such as status overlays changing while the user drags,
and is cancelled only when its origin port, fixed port, or replaced edge disappears.

Port families are host vocabulary, not package vocabulary. The host declares each family's color
and edge pattern in the graph configuration, and validation rejects ports or edges naming an
undeclared family so a typo fails before presentation. Workspace applies the family color as a CSS
custom property on each port and edge, so one generic stylesheet paints every family; theming a
family across light and dark is the host's choice of color value. Selection, hover, focus,
connection preview, and the `running` and `missing` status overlays are family-independent
treatments layered on that color. Source ports are filled and target ports hollow. Running flow
animation is limited to patterned edges and is disabled under reduced motion. Each visible port dot
owns its measured graph endpoint; its larger hover target owns interaction only.

The graph overlay stacks above section shells, the way patch cables lie over modules. Nested
sections are DOM descendants of group bodies, so an overlay below them hid and blocked every edge
that entered a group. Section content stays usable because only a narrow transparent stroke along
each edge takes pointer events; the visible path, labels, and connection preview never do. Two
port-hole clips keep ports above their cables: painting stops at each dot's rim, and hit-testing
excludes each port's whole hover target, so no edge hides a port or captures a gesture starting on
it. Each clip is one union of holes so adjacent ports cannot cancel each other's hole under the
even-odd rule, and its outer extent stays near the ports because Chrome stopped painting the holes
at very large clip coordinates. Resting edges use reduced stroke opacity; hover, focus, selection,
and status treatments restore full strength.

Cables that share a port are bundled the way patch cables are zip-tied: each runs a short straight
lane beside its neighbours, ordered by the height of its far end so the fan-out does not cross,
then curves to its destination from the lane's end. Bundling is presentation computed from the
measured endpoints on every geometry refresh, so it needs no host input and cannot disagree with
the controlled edges; the ties are decorative and never take pointer events. A cable shorter than
the tied run would be all bundle, so short hops stay direct and are not counted toward a bundle.

Controls under a cable take precedence over it. A capture-phase pointer-move listener, throttled to
one animation frame, hit-tests beneath the overlay; when the topmost non-graph element is a native
or ARIA control, editable content, CodeMirror, or a port, the overlay stops taking pointer events
until the pointer leaves that control. The state never changes while a button is held, so a press
that started on a control or a cable keeps its target for the whole gesture. Touch has no hover
before a press, so a tap still goes to whatever the overlay presents at that moment.

Deleting the focused edge moves keyboard focus to the canvas pane before the host removes the edge,
so focus stays inside the Workspace and an immediate `Mod+Z` reaches the history bindings.

An edge is drawn only between ports on the canvas. Sections hidden by the active saved view render
no ports, and a port scrolled outside its bounded group's scroll area contributes no endpoint, so
neither leaves a cable over unrelated content; scrolling refreshes the geometry. Minimized sections
and sections whose body moved to a managed window keep their canvas shell and its ports, so their
edges stay attached there. Managed windows, panels, and the minimap stack above the renderer
viewport, so cables never paint over them.

Viewport compositor promotion targets explicit section shells so it cannot replace a port's
centering transform while panning. XYFlow mounts no background, controls, minimap, attribution,
theme, or dependency stylesheet. All projected sections remain mounted, including offscreen
sections, because editor state, terminal state, measurement, focus, saved-view behavior, and graph
geometry depend on that continuity.

Edge selection stays host-controlled, but a selected ID whose edge is gone is stale presentation,
not an invariant violation: hosts remove edges for reasons Workspace cannot observe, such as
deleting the section that owns a port. Validation therefore drops unmatched selected IDs instead of
throwing, and the delete gesture reports the emptied selection after `onDelete` so hosts that only
apply the deletion still converge.

Native external drag data crosses one explicit canvas ingress boundary. Acceptance is synchronous
and limited to an exact bare-pane target; after acceptance Workspace translates the screen point
once and returns the original `DataTransfer` and drag event to the host. MIME interpretation,
authorization, creation, persistence, and feedback remain application responsibilities. Browser
objects never enter the document. A host that turns a drop into a section uses the public atomic
insertion funnel shared with creation commands, so the insertion itself enforces the
structure-editing capability and becomes one structural-history step instead of a complete-document
commit that would clear history.

Multi-section attention is host-owned transient presentation state. Semantic validation rejects an
unknown or hidden target without depending on render timing. Highlight state can therefore precede
the target's active canvas or managed-window projection. A fit waits on package-owned shell,
canvas, and renderer readiness signals, then frames the measured union and temporarily disables
conflicting viewport input until the renderer transition settles. Supersession, target
invalidation, complete document load, and host disposal settle a pending fit without applying stale
geometry. Highlight removal lingers to preserve main's visual cadence. The feature neither changes
selection nor writes presentation state into `WorkspaceDocument`.
Section framing includes the package-owned joined attachment group when one exists, so a terminal
or other attached runtime result stays inside the visible canvas along with its owning card. The
fit observes that group for measurement readiness; ordinary shell sizing and selection geometry
retain their existing boundaries.

## Direct drag handles

Meta controls expose a persistent, focusable drag grip. Starting on that grip enters the existing
free-move session without requiring a held modifier. A grip-owned session ends on drop or cancel;
modifier reconciliation cannot cancel it merely because Alt is not held. The five-pixel threshold
also applies to touch, where the dedicated grip already prevents page panning. Ordinary section
content retains its existing modifier gestures and control editing behavior.

Parameter rows expose a grip whenever structure editing is allowed and the list is unfiltered.
The same item drag engine handles nesting and reordering from that grip without entering global
item selection mode or disabling editable controls. Selection mode still enables whole-row and
multi-item dragging. Source identity checks prevent an ancestor row from capturing a descendant's
grip. Capability loss cancels an active parameter drag; filtered and read-only lists expose none.

## Nested sorting geometry

Nested sorting keeps the initial measured rectangles for the duration of a drag. Reading a peer's
animated position back into the sorting calculation would move the reference point and make the
preview jump. Newly mounted drop targets join that snapshot by identity, even if other targets
unmounted and the registry's total count stayed the same or decreased. Existing rectangles remain
frozen, and admitting a target does not mutate the previous snapshot.

The sortable presentation derives the active transform, displaced-peer transforms, and transitions
in one place. Collision ranking, directional hysteresis, temporary section placement, and deferred
drag cleanup retain their separate gesture responsibilities.

The provider and gesture monitors share upstream event translation. The provider owns cancellation
and collision cleanup: it aborts a cancelled upstream operation before delivering the mapped event,
then clears collision state after the callback. Subscribers therefore observe the gesture's final
collision state while handling either completion or cancellation.

## Managed-window geometry authority

Managed-window state remains a controlled host value, but an integrated `WorkspaceShell` owns the
geometry of its own presentation layer. It measures the exact manager surface and derives physical
boundary insets from package-owned pane widths, writing direction, and the saved-view tab strip.
Applications may observe that viewport when they invoke pure window transitions, but they do not
duplicate shell measurement or guess fallback dimensions. Viewport-dependent controls remain
unavailable until a positive measurement exists.

The standalone window manager keeps an explicit inset input because it has no shell composition to
inspect. It measures its own bounds and can publish the resulting viewport. In both compositions,
one manager-owned measurement drives clamping, snapping, docking, maximization, section handoff,
and Window Space normalization, so those behaviors cannot disagree about the usable rectangle.

## Extension and mutation boundaries

Registration calls replace one complete host-owned catalog. Candidate section kinds, commands,
creation commands, key bindings, toolbar contributions, and nonserializable item handlers are
validated against the catalogs they reference before any replacement becomes visible. This keeps
menus, headers, the Inspector, the toolbar, and keyboard dispatch on one command definition and
prevents a registration from stranding a contribution or binding.

Workspace exposes its disclosure-card and anchored-dropdown primitives for host-owned section
controls. They retain the package's scoped light and dark surfaces, focus behavior, text direction,
and keyboard semantics without requiring applications to import private styles or Radix directly.
Applications still own the option model and mutations; Workspace owns only the shared presentation
and interaction contract.

The controlled carousel follows the same boundary. Workspace owns single-item navigation,
thumbnail overflow, keyboard focus, and scoped presentation. Applications provide opaque React
content and own active-item meaning, persistence, and any synchronization with domain state. The
carousel is a reusable section-content primitive rather than a section kind or document entity.

The normalized-stroke surface owns the shared mechanics of drawing over a resizable projection:
unit-coordinate conversion, bounded point collection, pointer capture and cancellation, passive
rendering, non-scaling SVG paths, and Workspace gesture isolation. Applications provide controlled
strokes and styles and retain annotation identity, artifact or chart binding, intent, text,
selection semantics, validation, and persistence. No annotation domain shape enters the document.

Passive artifact and output previews remain application-owned. Their apparent media-element
overlap does not form one presentation contract: admission allowlists, load-failure policy,
download authority, structured-value rendering, runtime reference resolution, and domain actions
remain different. Workspace does not interpret MIME types or introduce an artifact model to hide
those distinctions.

Package mutations validate the complete request, construct one next canonical value, and publish
once. Coupled resources such as a section forest, item tree, selection, and derived node geometry
move through the same boundary. Browser objects, provider callbacks, file operations, and other
nonserializable effects cross explicit registries and never enter `WorkspaceDocument`.

The item Inspector keeps text edits as local drafts until blur validates and commits them; compact
parameter configuration commits changes immediately. They share immutable choice updates and
Escape handling while retaining those distinct publication boundaries. Date/time controls and
serialized item configurations share option vocabularies and scale bounds, so direct rendering and
document admission accept the same settings.

## Saved-view presentation authority

Workspace owns saved canvas views because it already owns top-level geometry, viewport
publication, section hierarchy, selection, focus, and rendered-node projection. An enabled
document has one active saved view; each view contains a complete root layout, camera, and exact
per-section visibility plus whether it is bookmarked for optional shell-tab presentation. Section
records, hierarchy, authored sizes, item values, shell pane state, managed windows, diagnostics,
and application runtime remain shared. A hidden ancestor suppresses
its rendered subtree in ordinary presentation. Host-scoped saved-view edit mode temporarily
projects hidden roots and descendants at reduced opacity, admits them to focus and selection, and
turns section controls and section commands into direct Show or Hide actions. Showing a descendant
also restores its hidden ancestor path. The integrated pane keeps view switching compact, exposes
management only in Edit mode, and leaves section inclusion with the canvas controls so the pane
does not duplicate the document hierarchy. The optional saved-view tab surface alone exposes
bookmark controls and renders bookmarked views at the bottom of the shell. Its shell-owned height
becomes a shell-wide bottom row and the shared bottom boundary for panes, rails, canvas,
package controls, and integrated or host-composed window chrome. Docked windows and
minimized-window recovery controls stay above the tab strip. Tab activation begins after the
initiating pointer task has finished so replacing the visible node projection cannot retain that
pointer in the outgoing XYFlow layout.

The active view and the live top-level layout and viewport are one synchronized contract. Every
live coordinate, measurement, stacking, or camera publication refreshes the active snapshot before
a document subscriber observes it. Activation first captures the outgoing presentation, then
stages the target presentation, visible node projection, pruned selection, and active id through
one publication boundary. It also resets interactions that may reference unmounted sections and
applies the target camera. Activation is presentation selection and remains available without
layout-edit capability; create, rename, delete, reorder, and visibility operations require it.
Leaving the integrated pane or loading a replacement document ends transient edit mode and prunes
hidden focus and selection.

Complete document replacement parses the saved-view shape before writing and reconciles only valid
section-set drift. Deleted section and root ids are pruned from every view; new sections become
visible in every view; new roots receive the incoming live layout. Existing inactive presentations
remain unchanged, and the incoming live layout and viewport refresh the active view. A host loading
persisted views beside a fresh application projection uses the package bootstrap projection to
reverse that last precedence deliberately: reconcile the persisted state, then project its active
layout and camera into one coherent document before loading.

The package owns constructors, validation, reconciliation, headless operations, visibility-aware
canvas, Outline, Find, focus and selection behavior, plus the optional integrated pane. Consumers
own enablement, persistence, revisions, sync, conflicts, routes, sharing, analytics, and
product-specific seed views. The package's browser-storage helpers for saved views and shell view
state are an optional local persistence choice, not a package-owned persistence policy: they
validate on load, treat unavailable or malformed storage as absent, and never throw, so a host can
always fall back to its own defaults. Saved views do not overlap with shell pane state or Window Spaces,
which arrange managed floating and docked windows.

## Top-level auto-layout authority

Workspace owns generic top-level rectangle layout because it already owns measured section
geometry, position locks, layout capability, canonical publication, and command availability. The
pure planner receives detached rectangles and an optional gap; it never reads section payloads or
infers product relationships. A host that needs semantic grouping remains responsible for that
policy and can call the same public planner with its chosen inputs.

The deterministic planner sorts unlocked rectangles by padded dimensions and stable document
attributes, then evaluates several height-aware shelf widths around the square-root-of-area
baseline. Candidate scoring combines occupied area, distance from a 4:3 landscape, shelf
raggedness, and normalized movement. The current top-left anchor is preferred when it is valid.
Locked roots remain fixed obstacles; outside candidates around their collective bounds guarantee a
safe placement without introducing a general graph-layout dependency or an unbounded interior-gap
search. The package default is 48 workspace units between rectangles.

Availability resolves layout capability before geometry. Every displayed root must have positive
finite live dimensions, and at least two roots must be unlocked. The action changes only unlocked
top-level `x` and `y` values, validates one complete next document, reprojects node geometry, and
publishes one `section-move` transaction. It preserves hierarchy, dimensions, stacking, viewport,
selection, and host data. The pane menu and palette command use the same availability result as
direct callers, including the already-arranged no-op state. The command also exposes the toolbar
surface so a host can opt it into its contribution layout without duplicating the operation.

## Section clipboard authority

Section clipboard support is host-scoped and opt-in. Workspace owns selection-root normalization,
the versioned structural envelope, external-input validation, root placement, command availability,
focus, and package-owned section presentation. The envelope is bounded before parsing and before
writing, rejects a different authority or payload version, and carries no compatibility parser.
Copy and paste yield to native editing surfaces; copy also yields to a browser text selection.
Duplicate reuses the same prepared authority payload without reading or replacing the operating
system clipboard.

A local authority lets Workspace allocate every section and item id before cloning opaque values,
then build and validate one complete candidate. Clone callbacks receive frozen source values and
detached runtime-read-only id maps. The candidate publishes once, selects the new roots, and records
one structural create transaction when local history is enabled. Outbound and inbound local data
share the same section, item, JSON-depth, and text-size bounds, so Workspace never reports a local
copy that its own parser cannot accept.

A delegated authority owns domain copyability, its closed payload and version, canonical identity
allocation, persistence, revisions, and accepted projection. Workspace passes frozen structural and
source snapshots to preparation, then invokes paste only after the envelope matches the registered
authority. It never publishes a speculative clone on this path. The delegate returns projected
root ids only after its canonical mutation and complete `commitWorkspaceDocument` publication have
succeeded; Workspace then focuses the first returned root. Authority registration snapshots a
validated descriptor, and only one clipboard operation may be pending for a host.

## Structural history authority

Structural history is an optional `WorkspaceHost` capability. Workspace owns the semantic boundary
for its own completed document mutations because it alone knows when a drag, resize, grouping
operation, or item action has become one coherent edit. A host without history configuration has
no history runtime, preserving a clear default for applications whose canonical authority lives
elsewhere.

The local authority stores a bounded past/future stack of detached, deeply frozen before/after
documents. It records section creation, deletion, grouping, movement, layout, and package-owned
presentation plus item creation, deletion, movement, and column layout. One resize gesture uses a
private batch boundary so automatic-size promotion and the final dimensions become one entry.
Replay uses the complete-document validation and atomic publication boundary, restores the
recorded selection, preserves the live viewport, and returns focus to a surviving selected section
or the canvas. Current structure and layout capabilities gate each navigation step.

Viewport, selection-only, saved-view management and activation, opaque section and item data, typed
item presentation and values, and automatic geometry normalization do not create structural
entries. Local replay compares its recorded source endpoint with the live document so later
unrecorded saved views, data, presentation, and derived geometry survive an unrelated structural
undo. The source endpoint is refreshed when an entry moves between stacks, preserving those values
when an entity is removed and later recreated by redo. CodeMirror retains its independent editor
history.

`loadDocument` and `commitWorkspaceDocument` are synchronization replacements rather than
package-authored edits. They clear local history so snapshots never cross a new canonical
application projection. A delegated authority receives the same frozen transaction metadata and
explicit load/projection synchronization events, owns availability and navigation, and decides how
to persist inverses, revisions, conflicts, or broader product history. Workspace forwards a
delegated undo or redo request and never applies that authority's document itself.

Host-owned state such as graph edges lives outside `WorkspaceDocument`, yet users expect one undo
stack. `recordWorkspaceHistoryEntry` pushes detached host `undo` and `redo` callbacks onto the local
stack, where they share ordering, the limit, redo invalidation, and synchronization clearing with
structural entries. Host entries need no Workspace capability because the host authorizes its own
state. Replay runs the callback inside the replay boundary, so document changes it causes are
observed rather than recorded, and recording from inside a callback fails. A throwing callback
leaves its entry in place. A delegated authority already owns product history and can record host
changes in its own vocabulary, so the call fails loudly there instead of widening the authority
contract with a second entry kind; it also fails when history is disabled.

The package-owned palette commands and default `Mod+Z` and `Mod+Shift+Z` bindings read the live
history authority. They decline without consuming the chord when unavailable and yield to editable
targets so native controls and CodeMirror keep their own history.

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

The editor measures horizontal and vertical native overflow independently. A dominant wheel axis
stays with CodeMirror only when that axis can scroll; an axis without overflow remains available to
Workspace canvas panning. Primary pointer interaction remains editor-owned for selection and
editing regardless of wheel ownership.

A generated document carries one explicit protected range. User transactions map that range with
their accepted edits; a host replacement supplies its own next text and range together and is not
mapped through itself. Any user transaction touching the protected range is rejected as a whole,
including undo and redo, so an edit cannot partially cross the ownership boundary.

Host-originated whole-document synchronization is excluded from CodeMirror history. CodeMirror
history may replay its own transaction with filtering disabled. Recording a host replacement would
therefore allow a later undo to restore superseded generated text while bypassing the protected
range filter and leaving the editor with a range that no longer describes its document. Existing
user history is mapped through the synchronization and later user edits remain undoable.

An optional Code-section submit callback is an application-effect boundary, not persistence owned
by Workspace. Mod-Enter reads the editor document synchronously, publishes that same value through
the existing controlled section-data path, and then gives the validated data to the registered
host callback. The handler exists only for an editable, unlocked presentation and runs ahead of
completion keys so a visible completion popup cannot capture the application chord. Workspace owns
the keyboard and editor consistency; the application owns saving, activation, errors, and retries.

Host-contributed header semantics remain application-owned, while
`WorkspaceSectionHeaderAction` owns their native header presentation. Keeping the compact target,
tooltip behavior, focus treatment, disabled state, and default or section-themed colors in one
package primitive prevents registered controls from depending on private header classes without
letting product state enter Workspace.

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

The ESM artifact bundles package-relative modules and the private editor dependency graph as one
CodeMirror runtime identity. The editor packages are therefore development dependencies: every
declared runtime dependency and peer stays external, and nothing else does. Consumers install no
editor packages and need no editor aliases or version overrides; the build includes the editor
dependencies' license notices. Public declarations must not name a bundled package either, so the
public language union lives apart from the CodeMirror language support. The build packs
`packages/workspace/setta.tgz`, which Code Polishy's `scope.bundledDependencies` declaration
inspects for leaked editor imports in the shipped JavaScript and public declarations. Source writes
relative imports with explicit `.js` extensions because the emitted declarations keep them verbatim,
and NodeNext consumers resolve no extensionless relative import; the packed consumer type-checks
under both Bundler and NodeNext resolution. The package-boundary check owns the emitted import list, exports-only manifest, scoped stylesheet
markers, and absence of dependency CSS.

## Verification harnesses

The packed-consumer harness materializes a temporary unrelated application from the freshly packed
artifact, installs it under repository supply-chain controls, and builds it through public exports
and the compiled stylesheet only. An isolated browser then renders editable and read-only code,
types into the editor, and undoes the edit. This catches runtime dependency-identity failures that
a successful bundler cannot detect. It is an artifact contract suite rather than routine source lint.

The production performance profile uses the deterministic 256-section browser fixture route and records
initial render, sustained panning, and drag behavior. Timing is machine-local evidence, never a
portable CI threshold. Fixture drift, missing gesture work, browser errors, and host-page scrolling
remain hard failures so a faster incomplete interaction cannot report success.

## Quick-start guidance

`WorkspaceQuickStart` presents host-owned steps in an ordinary shell tab. Workspace owns semantic
buttons, scoped light and dark styling, saved-view activation, and framing a known section. The
application owns the example identity, wording, target section and view IDs, when to show the
guide, and any pane visibility change before framing. The guide never creates or mutates product
content. Framing begins after the triggering event; removed targets are disabled with an
explanation, and hidden targets leave the workspace usable with visible guidance. There is no
tour state machine, completion tracking, storage, or modal blocking exploration.

## Browser execution boundary

The public `@riteofstring/setta/browser` entry is independent of React and the workspace runtime.
Static consumers need live computations without reproducing native server supervision. A dedicated
worker owns a validated dependency graph; the client owns one active run, one replaceable latest
input, a finite deadline, and disposal. Successful output carries its producing revision and stays
visible until a newer requested input succeeds. Obsolete runs never become current output.

Applications own stage implementations, result schemas, and presentation. The Gaussian playground's
scan parsing, packing, and rendering belong to the site; queuing, dependency ordering, progress,
cancellation, and worker recovery belong to this package. Cancellation terminates the dedicated
worker so synchronous handlers cannot prevent recovery. Worker inputs are cloned on admission so
later caller mutation cannot alter queued work. The caller supplies a fresh worker factory for restarts.

Long downloads and batched computations report optional fractional progress and application-owned
messages through the stage context. Progress shares the run revision and lifecycle with stage status;
it cannot replace output, extend deadlines, or revive a cancelled or superseded run. Reports after a
handler settles are ignored. The client keeps the latest report per stage, resetting it on each new
request or cancellation. Models, download/cache policy, and GPU resources remain application-owned.

The npm artifact exports ESM, declarations, compiled scoped styles, and the independent browser
entry under the canonical `@riteofstring/setta` name. Browser fixtures stay private; the library carries its
own Apache license and public repository metadata. Source aliases are not a consumer API.
