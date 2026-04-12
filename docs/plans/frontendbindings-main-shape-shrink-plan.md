# Frontendbindings Main-Shape Shrink Plan

## Goal

Shrink the Go -> TypeScript pipeline so it has the same shape as main branch's
Python -> TypeScript pipeline:

- one generic type converter
- one endpoint converter
- a small metadata layer for exceptions
- owner packages define contracts and defaults
- `internal/frontendbindings` stops acting like a second backend contract tree

The target package should feel like a thin generator boundary, not a storage
yard for mirrored structs, enums, unions, and frontend-only hand-written type
logic.

## Design Rules

- Go owns contracts. `frontendbindings` does not own contracts unless they are
  truly frontend-only generator metadata.
- The default path must be generic reflection plus narrow metadata.
- The endpoint path must stay separate from the type path.
- A type should be declared in `frontendbindings` only if one of these is true:
  it is a frontend-only helper declaration, it is a true union/tuple/set that
  reflection cannot express directly, or it is transitional and has an explicit
  deletion owner.
- Do not rewrite the renderer again while ownership is still wrong.
- Do not add new mirrored structs to `internal/frontendbindings` during the
  cleanup.

## Target Shape

After cleanup, `internal/frontendbindings` should mostly contain:

- `specs.go` or a generated replacement for route and endpoint manifests
- `type_compiler.go`
- `type_declarations.go`
- `type_metadata.go`
- `type_helpers.go`
- `render.go`
- generated discovery registries

Everything else should either move to the real owner package or collapse into a
small metadata table.

The long-term ideal is:

- backend owner packages export exact request/response structs, defaults, and
  enum metadata
- endpoint generation consumes a typed endpoint manifest
- type generation consumes discovered owner types plus a small exception layer

## Phase 0: Freeze The Scope

Before more cleanup work, set explicit boundaries:

- `generatedRoutes.ts`, `generatedTypes.ts`, and `generatedEndpoints.ts` are the
  compatibility surface
- `internal/frontendbindings/type_compiler.go` is not the primary rewrite target
- no new support file should add mirror-owner structs just to make generation
  easier
- each remaining declaration in `frontendbindings` must be classified as either
  `keep`, `move`, or `delete`

Deliverable:

- a checked-in ownership manifest listing every declaration currently emitted
  through `CurrentAdditionalDeclarations()` and every named type discovered by
  `DiscoveredConvertibleTypes()`

## Phase 1: Inventory And Classify The Package

This phase is the key reset. Do not start moving code until this inventory
exists.

For each declaration or wrapper in `internal/frontendbindings`, record:

- Type or declaration name
- Current file
- Current reason it exists
- Real owner package, if one already exists
- Whether the frontend needs special TS-only semantics
- Whether a default/create helper exists
- Whether the declaration can be derived generically after owner migration

Classification buckets:

- `Owner-backed already exists`: replace with wrapper override or direct owner
  use and delete local mirror
- `Owner should exist elsewhere`: move the type to the real package first
- `Generator metadata`: keep as a narrow exception
- `Frontend-only helper`: keep, but isolate from the type compiler
- `Dead/obsolete`: delete

Priority files for this audit:

- `internal/frontendbindings/project_state_support.go`
- `internal/frontendbindings/specs.go`
- `internal/frontendbindings/type_factories.go`
- `internal/frontendbindings/type_reflected_metadata.go`
- `internal/frontendbindings/type_metadata.go`
- `internal/frontendbindings/contracts.go`
- `internal/frontendbindings/websocket_support.go`
- `internal/frontendbindings/ai_*_support.go`
- `internal/frontendbindings/filebrowser_support.go`
- `internal/frontendbindings/git_support.go`
- `internal/frontendbindings/terminal_support.go`

## Phase 2: Delete Mirror Ownership By Domain

This is the highest-leverage phase. The package will not get materially smaller
until the mirror-owner files are drained.

Work domain by domain, not helper by helper.

Recommended order:

1. Route-level request and response contracts now trapped in
   `internal/frontendbindings/specs.go`
2. Project-state families in
   `internal/frontendbindings/project_state_support.go`
3. Websocket/runtime/message families in
   `internal/frontendbindings/websocket_support.go`,
   `internal/frontendbindings/contracts.go`, and
   `internal/frontendbindings/ai_runtime_support.go`
4. File browser, git, terminal, artifact, and AI settings families
5. Remaining enums and thin wrappers used only to feed generation

For each domain:

- export the exact backend-owned struct or enum from the real package
- point discovery and wrapper override metadata at that owner
- remove the local `frontendbindings` mirror
- keep only the minimal TS-only declaration if reflection still cannot express
  the final shape

Rules:

- if the route contract belongs to HTTP, it should live under `internal/httpapi`
- if the runtime message belongs to websocket transport, it should live under
  `internal/wsapi` or the real runtime owner
- if the contract belongs to project state, it should live under
  `internal/projectstate` or `internal/projectview`
- `frontendbindings` may wrap an owner, but it should stop defining the owner

Success bar for this phase:

- `project_state_support.go` and the domain support files become mostly aliases,
  wrapper redirects, or disappear entirely
- adding a normal backend type no longer requires creating a local mirror struct
  in `frontendbindings`

## Phase 3: Collapse Factories And Defaults To Generic Paths

`type_factories.go` should stop being a second hand-written object-construction
layer.

Target shape:

- owner packages provide default values through ordinary exported Go functions
- generator code turns those Go defaults into TS literals generically
- factory generation is a small number of reusable patterns:
  - merge with defaults
  - nested merge with defaults
  - clone collection fields
  - small per-field expression overrides for true runtime hooks

Delete or migrate any factory logic that still lists ordinary fields one by one.

Keep only narrow exceptions such as:

- generated ids
- random/default names
- discriminated-union helper fields that cannot be inferred from defaults alone

Success bar for this phase:

- ordinary structs gain create helpers without handwritten field inventories
- `type_factories.go` becomes pattern code, not per-type code

## Phase 4: Reduce Metadata To True Exceptions

After owner migration, cut `type_metadata.go` and
`type_reflected_metadata.go` down to cases reflection cannot express cleanly.

Acceptable metadata:

- true unions
- tuple aliases
- type sets and type guards
- property-level TS type overrides for intentional broad Go field types
- frontend-only helper declarations

Unacceptable metadata:

- restating whole object shapes that already exist in Go
- carrying enums locally because the owner package never exported them
- per-type create logic for ordinary objects

Success bar for this phase:

- metadata entries are short and obviously exceptional
- adding a normal struct or enum does not require editing a giant metadata map

## Phase 5: Replace The Handwritten Endpoint Inventory

If the goal is to really match main branch simplicity, `specs.go` must stop
being a 3k+ line hand-maintained endpoint manifest.

Main branch endpoint generation was simple because it introspected FastAPI route
metadata directly. The Go equivalent is to give `internal/httpapi` a typed
endpoint registration surface that both the server and generator can consume.

Target shape:

- each route registers method, path, request type, response type, and binary or
  multipart policy once
- route names and generated function names are derived or attached there once
- frontend endpoint generation consumes that manifest instead of a hand-written
  `CurrentEndpoints()` list

Possible implementation shapes:

- typed registration helpers in `internal/httpapi`
- a generated endpoint manifest from backend route metadata
- explicit endpoint descriptors colocated with route registration

What matters:

- one source of truth
- generator reads typed backend metadata
- `frontendbindings` no longer inventories thousands of lines of endpoint specs

Success bar for this phase:

- `specs.go` shrinks to route groups plus a thin manifest adapter, or disappears
  as a handwritten endpoint inventory

## Phase 6: Keep Frontend-Only Helpers, But Separate Them

Some declarations really are frontend-only and should not be forced into owner
packages just for ideological purity.

Examples:

- bootstrap handoff constants
- frontend validation helper functions built from Go-owned contract data
- small frontend parsing helpers derived from backend-owned enums or constants

Keep these, but move them into a clearly separate layer so they do not look like
shared type ownership.

Recommended rule:

- if a file emits executable TS helpers or frontend constants, keep it out of
  the generic type-owner path

## Verification Strategy

Do not use generator drift tests as the main guardrail.

Use focused verification:

- `./scripts/go.sh test ./internal/frontendbindings -count=1`
- `./scripts/go.sh test ./internal/pythonsharedtypes -count=1`
- targeted package tests for each moved owner package
- `pnpm -C frontend exec tsc --noEmit`
- relevant frontend tests when generated endpoint or type usage changes

For each migration batch, verify:

- the generated TypeScript shape for the touched surface still matches expected
  caller usage
- the backend owner package now exports the canonical type
- `frontendbindings` no longer contains the deleted mirror

## Order Of Attack

The most pragmatic execution order is:

1. Build the ownership manifest
2. Drain `project_state_support.go`
3. Drain websocket/runtime/contracts support files
4. Collapse factories/defaults
5. Shrink metadata
6. Replace the handwritten endpoint inventory in `specs.go`

Do not start with another generic converter rewrite. That is the wrong critical
path.

## Definition Of Done

This effort is done when all of the following are true:

- `internal/frontendbindings` is mostly generator infrastructure, not domain
  contract storage
- the generic compiler handles ordinary structs, aliases, maps, slices, pointers,
  and enums without per-type edits
- metadata is short and exceptional
- factory generation is generic and Go-default-backed
- endpoint generation reads typed backend metadata instead of a giant local
  inventory
- adding a new normal backend contract usually means touching the owner package
  only, not `frontendbindings`
