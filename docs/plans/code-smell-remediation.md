# Code Smell Remediation Plan

## Objective

Fix the code smells found in the repository review without weakening the
current ownership model:

- Go remains the owner of backend contracts and persisted state.
- `internal/httpapi` remains the owner of HTTP endpoint request and response
  contracts through its endpoint registry.
- TypeScript surfaces derived from Go-owned contracts are generated.
- Generated outputs are regenerated, not manually edited.
- Runtime failures should be loud and specific.
- HTTP contract generation should stay lightweight for the current internal
  Electron-main-to-Go API.

The intended user-visible behavior should stay the same except for two explicit
changes:

- malformed persisted JSON with trailing data should be rejected
- large workspace lists should remain responsive instead of rendering every row
  into the DOM

## Non-Goals

- Do not add backward compatibility shims, legacy field aliases, migrations, or
  dual-read paths.
- Do not add a generator drift test that only reruns the generator and compares
  checked-in generated files.
- Do not introduce heuristic parsing of backend payloads, JSON state, or IPC
  messages.
- Do not move endpoint ownership out of `internal/httpapi`.
- Do not manually edit `desktop/src/generated/backend.ts`.

## Work Order

1. Add strict persisted JSON decoding.
2. Generate lightweight backend endpoint metadata, runtime decoders, and a
   typed backend client.
3. Replace scattered IPC string literals with a shared typed IPC contract.
4. Make workspace store operations stale-response safe.
5. Add exhaustive union handling for renderer operation labels.
6. Add scalable workspace list rendering and performance guardrails.
7. Run formatting, quality, and supply-chain verification.

This order fixes isolated correctness first, then contract ownership, then UI
state and rendering.

## 1. Strict Persistent JSON Decoding

### Current Problem

`internal/httpapi.decodeRequest` rejects trailing JSON by decoding once and then
verifying EOF. Persisted state loading does not do the same.

Current affected paths:

- `internal/appstate/store.go`
- `internal/workspace/workspace.go`

Example of bad state that can currently be partially accepted:

```json
{"schemaVersion":1,"selectedWorkspaceId":"","activeWorkspaceIds":[],"recentWorkspaces":[]}{"junk":true}
```

The first object is valid, but the file as a whole is corrupt. The loader should
reject it.

### Target Design

Create a small JSON decoding package with a precise purpose, for example
`internal/jsonio`, and expose a helper such as:

```go
func DecodeSingle(reader io.Reader, target any) error
```

The helper should:

- use `json.NewDecoder`
- call `DisallowUnknownFields`
- decode exactly one JSON value into `target`
- decode once more and require `io.EOF`
- return the underlying decode error without hiding its cause

Callers should wrap errors with domain context, for example:

- `malformed app state <path>: <error>`
- `malformed workspace metadata <path>: <error>`
- `request body must be valid JSON: <error>`

### Implementation Steps

1. Add `internal/jsonio/decode.go`.
2. Move the strict single-value decoding logic out of
   `internal/httpapi.decodeRequest` into `internal/jsonio.DecodeSingle`.
3. Update `internal/httpapi.decodeRequest` to use the helper while preserving
   existing HTTP 400 error messages.
4. Update `appstate.Store.Load` to reject trailing JSON.
5. Update `workspace.loadState` to reject trailing JSON.
6. Keep app-state and workspace-state validation in their existing domain
   packages. The shared helper should only own JSON decoding mechanics.

### Tests

Add focused tests:

- app state with trailing JSON is rejected
- workspace metadata with trailing JSON is rejected
- HTTP request body with trailing JSON still returns `invalid_json`
- unknown JSON fields still fail in all three paths

Use temporary directories for app and workspace state tests.

## 2. Generated Backend Endpoint Metadata, Runtime Codecs, And Lightweight Client

### Current Problem

The Go endpoint registry owns endpoint method, path, request type, and response
type:

```go
post[OpenWorkspaceRequest, OpenWorkspaceResponse]("OpenWorkspace", "/workspaces/open", handler.openWorkspace)
```

TypeScript currently duplicates some of that knowledge manually:

```ts
requestBackend(baseURL, "/workspaces/open", ..., parseOpenWorkspaceResponse)
```

The TypeScript path strings and response parsers can drift from the Go registry
even though the generator already has access to the endpoint schema.

### Target Design

Extend `cmd/generate-contracts` so `desktop/src/generated/backend.ts` contains
the generated backend surfaces needed by Electron main:

- TypeScript interfaces for reachable Go payload structs
- generated endpoint descriptors from `httpapi.Contracts()`
- generated runtime decoders for generated response and error payload structs
- generated endpoint operations consumed by a small hand-written generic client
  or a generated typed backend client if that stays simpler

The generated code should fail loudly on unsupported contract shapes. It should
not expose `unknown`, `any`, or best-effort parsed payloads to callers. Decoder
function inputs can accept `unknown`; decoded outputs must be exact generated
types.

This should not become a general schema framework. Generate only the contract
shapes Setta currently owns and uses. If a new Go contract shape is unsupported,
generation should fail with a specific error and the shape should be added
deliberately.

Example generated shape:

```ts
export const backendEndpoints = {
  OpenWorkspace: {
    method: "POST",
    path: "/workspaces/open",
  },
} as const;

export function decodeOpenWorkspaceResponse(value: unknown): OpenWorkspaceResponse {
  // generated field checks
}
```

A generated or generated-backed client should expose operations such as:

```ts
const client = createBackendClient(baseURL);
await client.openWorkspace({ rootPath });
```

### Implementation Steps

1. Extend the generator model so collected endpoint specs are rendered alongside
   interface specs.
2. Validate endpoint names, methods, paths, request types, and response types in
   the generator. Duplicate endpoint names and duplicate method/path pairs
   should fail generation.
3. Generate endpoint descriptors directly from `httpapi.Contracts()`.
4. Generate decoders for supported Go contract shapes:
   - `bool`
   - `int`
   - `string`
   - slices
   - named structs
5. Generated decoders should reject:
   - non-object values for structs
   - missing required fields
   - fields with the wrong runtime type
   - unknown fields, unless a future endpoint contract explicitly models them
6. Generate `decodeErrorResponse` from the Go-owned `ErrorResponse` contract.
7. Generate or add a small typed client that:
   - builds URLs from generated endpoint descriptors
   - sends JSON only for endpoints with request bodies
   - parses success payloads with generated response decoders
   - parses error payloads with generated error decoders
8. Replace `desktop/src/main/backend-health.ts` and
   `desktop/src/main/backend-workspace.ts` usage with the generated client.
   Delete those files if they no longer own any useful hand-written logic.
9. Run `go run ./cmd/generate-contracts` and commit the regenerated output.

### Tests

Add generator tests that exercise a synthetic `httpapi.ContractSchema` and
assert behavior of the generator functions. These are generator unit tests, not
checked-in artifact drift tests.

Add TypeScript tests for the generated-backed client behavior:

- success response is decoded
- backend error response becomes a specific thrown error message
- malformed success response fails loudly
- unknown response fields fail
- GET endpoint does not send a JSON body
- POST endpoint sends the request payload as JSON

Existing Go HTTP endpoint tests should continue to exercise production handlers.

## 3. Shared Typed IPC Contract

### Current Problem

IPC channel names are repeated in preload and main:

```ts
ipcRenderer.invoke("workspace:remove-recent", id)
ipcMain.handle("workspace:remove-recent", ...)
```

TypeScript cannot prove those strings match. Tests cover some paths, but the
contract itself is still stringly typed.

### Target Design

Add a shared IPC contract module under `desktop/src/shared`, for example
`desktop/src/shared/ipc.ts`.

It should define:

- channel constants
- each channel's argument tuple
- each channel's result type
- typed wrappers for renderer `invoke` and main `handle`, or type aliases used
  by thin wrappers in preload and main

Example shape:

```ts
export const ipcChannels = {
  workspaceRemoveRecent: "workspace:remove-recent",
} as const;

export interface IpcContract {
  workspaceRemoveRecent: {
    args: [id: string];
    result: WorkspaceSession;
  };
}
```

Electron's `ipcRenderer.invoke` and `ipcMain.handle` APIs are not strongly typed
by channel. If casts are needed, they should be localized inside one adapter,
not scattered through app code. Do not use `as any`.

### Implementation Steps

1. Add `desktop/src/shared/ipc.ts`.
2. Move all channel names into `ipcChannels`.
3. Model channel args and results in `IpcContract`.
4. Add a typed preload helper for `ipcRenderer.invoke`.
5. Add a typed main-process helper for `ipcMain.handle`.
6. Replace literal strings in:
   - `desktop/src/preload/index.ts`
   - `desktop/src/main/index.ts`
   - `desktop/src/main/browser-pane.ts`
7. Keep the renderer API shape in `SettaAPI`; the renderer should still call
   `window.setta.workspace.select(...)`, not raw IPC.
8. Update preload tests to assert against `ipcChannels` rather than duplicating
   literals.

### Tests

Add or update tests for:

- preload invokes the expected shared channel constants
- typed handler registration preserves argument order
- browser pane IPC channels use the same shared contract

Use TypeScript typechecking as the main exhaustive check for channel result
types.

## 4. Workspace Store Operation Runner

### Current Problem

`desktop/src/renderer/src/stores/workspace-store.ts` repeats the same async
state machine for every operation:

```ts
set({ error: null, operation: "closing" });
try {
  const session = await window.setta.workspace.close(id);
  set({ operation: null, session, status: "ready" });
} catch (error) {
  set({ error: errorMessage(error), operation: null, status: "error" });
}
```

This duplication makes future behavior drift likely. It also does not protect
against stale async responses. If two operations overlap, the slower older
operation can overwrite newer state.

### Target Design

Introduce one internal operation runner that owns operation lifecycle behavior:

- clear the previous error
- mark the current operation kind
- assign a monotonically increasing operation id
- commit success only if the completing operation id is still current
- commit error only if the completing operation id is still current
- clear the operation only for the current operation id

The exported UI state can remain simple:

```ts
type WorkspaceOperationKind =
  | "closing"
  | "opening"
  | "removingRecent"
  | "reordering"
  | "selecting";

type WorkspaceOperation = WorkspaceOperationKind | null;
```

The operation id can remain private to the store implementation.

### Implementation Steps

1. Split `WorkspaceOperation` into `WorkspaceOperationKind` and
   `WorkspaceOperation` if that makes exhaustive mappings cleaner.
2. Add a private operation sequence counter inside the store module or store
   state.
3. Add a helper such as `runWorkspaceOperation(kind, action, applyResult)`.
4. Use the helper for:
   - `openLocalFolder`
   - `selectWorkspace`
   - `closeWorkspace`
   - `reorderWorkspaces`
   - `removeRecent`
5. Decide whether `loadSession` should use the same operation id mechanism even
   though it reports `status: "loading"` instead of a named operation. It should
   still get stale-response protection.
6. Keep the catch blocks because they handle a specific UI failure path: turning
   rejected backend or IPC operations into renderer error state.

### Tests

Add store tests using deferred promises:

- newer operation result wins over older operation result
- stale older rejection does not overwrite newer success with an error
- stale older success does not clear a newer operation
- canceled folder open clears only the current opening operation
- existing successful operation tests still pass

## 5. Exhaustive Renderer Union Handling

### Current Problem

`operationLabel` switches over workspace operation strings without a `never`
assertion or `satisfies` mapping. If a new operation is added, TypeScript does
not force labels to be updated.

### Target Design

Use a `satisfies` mapping for operation labels:

```ts
const operationLabels = {
  closing: "Closing",
  opening: "Opening",
  removingRecent: "Removing",
  reordering: "Reordering",
  selecting: "Selecting",
} satisfies Record<WorkspaceOperationKind, string>;
```

Then `operationLabel` becomes a lookup:

```ts
function operationLabel(operation: WorkspaceOperationKind) {
  return operationLabels[operation];
}
```

### Implementation Steps

1. Export `WorkspaceOperationKind` from the workspace store.
2. Replace the `switch` in `App.tsx` with a `satisfies` mapping.
3. Look for other renderer mappings over closed unions and apply the same
   pattern where the mapping is clearer than a switch.
4. If a switch remains over a discriminated union, add an `assertNever` helper
   in the owning module rather than a generic utility drawer.

### Tests

Rely primarily on `tsc --noEmit`. If operation labels are moved into a separate
module, add a small test only if it verifies behavior beyond restating the map.

## 6. Scalable Workspace List Rendering

### Current Problem

The renderer maps every active workspace and every recent workspace directly to
DOM nodes. This is acceptable for small lists but has no scale guardrail.

Affected areas:

- active workspace list in `App.tsx`
- recent workspace list in `App.tsx`

The repository explicitly requires frontend code to handle very large DOMs
efficiently.

### Target Design

Separate product retention policy from rendering scalability:

- Rendering should stay efficient even when given a very large workspace list.
- The backend may still define an explicit recent-workspace retention policy,
  but the UI should not rely on that policy for DOM safety.

Use virtualized rendering for workspace lists. Prefer a proven library such as
`@tanstack/react-virtual` if adding the dependency passes the repo's dependency
and supply-chain workflow. Pin the dependency exactly and use
`./update_dependencies.sh` for lockfile changes.

If adding a dependency is not acceptable, implement a small fixed-row-height
virtual list locally and test it thoroughly. Do not use ad hoc truncation as the
UI performance fix.

This is the most dependency-sensitive remediation item. If the generated
backend client and IPC cleanup are ready to land first, this rendering work can
be split into a follow-up commit as long as the large-list risk remains tracked.

### Implementation Steps

1. Baseline current behavior before refactoring:
   - create a temporary app state with a large recent workspace list
   - measure rendered DOM row count
   - measure initial render responsiveness with Playwright or Chrome DevTools if
     it can be done without building a broad profiling harness
   - record concise results in an append-only performance report, for example
     `docs/performance/workspace-list-rendering.md`
2. Extract workspace sidebar/list components out of `App.tsx`:
   - `WorkspaceSidebar`
   - `WorkspaceList`
   - `RecentWorkspaceList`
   - `WorkspaceListRow` if useful
3. Use semantic list structure where practical:
   - `nav` or `section` for list regions
   - `ul` and `li` for repeated workspace rows
4. Add virtualization to active and recent workspace lists.
5. Keep stable row dimensions so hover state, labels, icons, and button states
   do not resize the layout.
6. Re-measure the same large-list scenario and append the after results to the
   performance report.
7. If a backend retention cap is desired, add it explicitly in the
   workspacesession domain and document the user-facing policy. Do not silently
   drop data from app state without a named product rule.

### Tests

Add Playwright coverage that seeds many workspaces through temporary app state:

- the app opens without rendering every recent workspace row
- visible rows are bounded to viewport plus overscan
- scrolling can reveal a workspace near the end of the list
- selected active workspace behavior still works

Keep existing workspace interaction tests passing.

## Final Verification

After implementation, run:

```sh
go run ./cmd/generate-contracts
./scripts/format.sh
./check_quality.sh --all
./scripts/check_supply_chain.sh
```

If a frontend dependency is added, use:

```sh
./update_dependencies.sh
```

Then rerun the full verification list.

## Expected End State

- Persisted JSON state is decoded exactly once and rejects trailing data.
- Backend endpoint paths, methods, request types, response types, and response
  decoders are generated from `internal/httpapi`.
- Electron main uses a generated or generated-backed backend client instead of
  manual path strings and hand-written response mirrors.
- IPC channel names and request/response types live in one shared typed
  contract.
- Workspace store operations share one stale-response-safe async lifecycle.
- Renderer operation labels are exhaustively checked by TypeScript.
- Workspace list rendering has measured large-list performance and bounded DOM
  growth.
