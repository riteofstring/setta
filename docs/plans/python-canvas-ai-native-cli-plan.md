# Python Canvas AI-Native CLI Plan

## Status and purpose

**Status: Implemented.**

Add a small semantic CLI that lets an AI agent inspect and mutate the same live Python Canvas project
the browser is showing. The CLI is an alternative client for the existing application service, not
a second project engine and not a wrapper around MCP.

This is the only active plan in `docs/plans`. The implemented right-pane plan and earlier completed
plans remain in Git history rather than continuing to instruct later work.

## Product outcome

An agent can discover the complete command contract, inspect the canonical application state, and
make any currently supported authored-project mutation with three commands:

```text
python-canvas schema
python-canvas snapshot --url http://127.0.0.1:8080
python-canvas apply --url http://127.0.0.1:8080 --file operation.json
```

`apply --file -` reads one operation from stdin. Successful commands emit exactly one strict JSON
document on stdout. Errors emit exactly one stable JSON error document on stderr and use a nonzero
exit status. `--pretty` changes indentation only; it never changes the data contract.

The normal browser application keeps using the existing server launch arguments. This batch does
not implement PyPI packaging. When the reserved `setta` distribution becomes the product entrypoint,
the same command package can be mounted at `setta python-canvas ...` without changing operation names
or semantics. Do not introduce a compatibility alias or a second implementation in preparation for
that future packaging work.

## Fixed decisions

### 1. The live coordinator remains authoritative

The CLI talks to a running Python Canvas backend over its existing loopback V2 HTTP API. It never
loads, edits, replaces, or locks `project.json` directly. This keeps browser and CLI mutations on the
same coordinator, transaction, renderer, provider, persistence, revision, and diagnostic paths.

There is no offline mutation mode in this batch. If the backend is unavailable, return a typed
connection error instead of guessing that an absent service means an empty project or silently
falling back to file editing.

### 2. Expose semantic operations, not transport details

The public CLI accepts a closed operation union. Callers do not provide HTTP methods, route paths,
`projectId`, or `expectedRevision`. For every `apply`, the CLI:

1. fetches one canonical snapshot;
2. binds the operation to that snapshot's exact project ID and revision;
3. maps it to one existing V2 mutation request;
4. submits it once; and
5. validates and returns the canonical response.

The backend's revision conflict is returned unchanged in the CLI error data. Never auto-retry a
mutation: retrying against a newer revision could overwrite a concurrent browser decision.

The initial closed operation set covers the complete authored mutation surface that the browser can
currently invoke:

- `project.rename`
- `callable.create`, `callable.rename`, `callable.delete`, and `callable.commit`
- `callable.parameters.refresh` and `callable.parameters.set`
- `parameterDictionary.create`, `parameterDictionary.rename`,
  `parameterDictionary.delete`, and `parameterDictionary.entries.set`
- `list.create`, `list.rename`, `list.delete`, `list.children.increment`, and
  `list.children.decrement`
- `forest.replace`
- `pythonTarget.set`

Parameter and dictionary-entry payloads carry their complete existing V2 UI configuration. This
makes UI-type changes available without inventing a separate parameter-presentation endpoint.

Do not expose completion requests, PTY attachment, terminal input, browser layout, selection,
viewport, pane preferences, diagnostics as authored mutations, raw endpoint access, or arbitrary
project-file replacement in this batch.

### 3. Machine-readable behavior is the default

`snapshot` returns the existing validated `ProjectSnapshotV2` document directly. It therefore
includes project identity/revision, target prefix/suffix, section forest, callables, parameter
dictionaries, lists, generated Python, source ranges, provider lifecycle, diagnostics, and
diagnostic freshness.

`schema` returns one JSON document that describes:

- the CLI contract version;
- each operation name;
- its required and optional fields;
- nested parameter/UI shapes by reference to the existing V2 vocabulary; and
- one concise example per operation.

Keep one authoritative operation registry in Go for strict decoding, schema publication, and route
selection. Do not hand-maintain three independent lists in parsing, help text, and schema output.

Unknown operation names, unknown JSON fields, duplicate JSON documents, missing required values,
empty IDs, invalid URLs, and oversized input are user-fixable input failures. Decode external JSON
once at the CLI boundary and use validated typed values internally.

### 4. Diagnostics can be settled explicitly

Both `snapshot` and `apply` accept `--wait-diagnostics` and a bounded `--timeout` (default 10s when
waiting). Waiting opens the canonical project event stream and consumes pushed snapshots until
`diagnosticsRevision == project.revision` and the provider is no longer pending. The browser uses
the same stream, so a CLI mutation appears in an already-open canvas without reload or polling. A
new or reconnected subscriber immediately receives the current complete `ProjectSnapshotV2`.

Timeout returns a typed error containing the latest project revision, diagnostics revision, and
provider state. Cancellation and timeout do not mutate the project. Do not hide provider failure,
turn a failed provider into an empty diagnostic set, or wait indefinitely.

### 5. URL and output boundaries stay narrow

The default service URL is `http://127.0.0.1:8080`. `--url` accepts an absolute `http` URL whose
host resolves syntactically to loopback (`localhost`, `127.0.0.0/8`, or `::1`) and whose base path,
query, user info, and fragment are empty. The CLI does not send project content or mutations to a
non-loopback destination.

Use a timeout-bounded HTTP client. Validate successful snapshot bodies with the existing V2
contract before printing them. Preserve the backend's typed API error code and revision fields; do
not print response HTML, internal stack details, or mixed prose around JSON.

Exit statuses are stable:

- `0`: success;
- `2`: invalid CLI input, strict operation/schema validation failure, or a typed V2 request failure;
- `1`: connection, timeout, malformed server response, or unexpected internal failure.

Stdout remains empty on failure. Stderr remains empty on success. Help is the sole human-readable
exception and is written to stdout with status `0`.

## Architecture

Add one backend-internal CLI package with injected stdin, stdout, stderr, and HTTP client seams.
Keep `cmd/python-canvas` as a thin argv/signal/exit-code adapter. The existing server startup remains
the default path when server flags are supplied; `schema`, `snapshot`, and `apply` dispatch to the
new package before server flag parsing.

The CLI package may import the authoritative `internal/contracts` package. It must not import the
aggregate, coordinator, renderer, project-file adapter, provider, terminal runtime, or HTTP server
implementation. Mutation execution stays on the service side of the HTTP boundary.

Route construction and request encoding belong to the operation registry. Common request fields
are injected after the operation has been strictly decoded. Percent-encode path IDs with URL path
segment semantics; never concatenate untrusted IDs into a route without escaping.

The coordinator owns one latest-value publication stream. The HTTP adapter exposes it as
`GET /api/v2/project/events` using server-sent events. Every event contains a complete validated
snapshot; there are no partial patches, event cursors, heartbeat timers, or client polling loops.
The browser reconciles newer pushed snapshots through its existing serialized mutation boundary so
a publication cannot overtake the HTTP response that maps an optimistic section to its canonical
identity. No `@setta/workspace` API change is required.

## Acceptance behavior

1. `schema` runs without a backend, emits stable valid JSON, and lists every operation above exactly
   once with no transport-owned `projectId` or `expectedRevision` input.
2. `snapshot` against a real loopback handler emits a byte-valid, contract-valid canonical V2
   snapshot and no other stdout.
3. `apply` reads one strict operation from a file or stdin, fetches the current snapshot, sends the
   correctly typed V2 mutation with its exact ID/revision, and emits the returned canonical snapshot.
4. A callable create followed by callable commit is pushed into an already-open browser without a
   reload; the browser performs no repeated project GETs.
5. Every current authored mutation family has at least one registry/route/request conformance test;
   nested parameter and dictionary UI payloads are preserved exactly.
6. A concurrent browser mutation produces `revision_conflict`; the CLI does not retry and reports
   expected/current revisions with exit status `2`.
7. Unknown fields, unknown operations, malformed or multiple JSON documents, non-loopback URLs, and
   oversized input are rejected before any mutation request.
8. `--wait-diagnostics` returns only after diagnostics reach the returned project revision, while a
   bounded timeout reports the latest freshness/provider facts without mutating state.
9. Network failures and malformed successful responses use exit status `1`, strict JSON stderr, and
   empty stdout. Typed backend failures use exit status `2` and preserve the backend code.
10. Existing browser launch, production preview, project persistence, generated code, diagnostics,
    and terminal behavior remain unchanged.

## Focused verification

- Table-driven Go tests for root dispatch, help, exit codes, URL validation, exact JSON decoding,
  file/stdin input, stable schema output, and operation registry completeness.
- `httptest` contract tests for every operation route/body, snapshot validation, backend errors,
  no-conflict-retry behavior, the long-lived event stream, and pushed diagnostic settling/timeout.
- One live-handler acceptance test that applies a mutation through the CLI and observes the same
  coordinator snapshot through the V2 endpoint.
- Existing `cmd/python-canvas` startup tests to prove server launch arguments are unchanged.
- Focused workspace test for the adjusted parameter-picker inset.
- Near completion, run `code-policy test --changed` in the caller's single task session. Do not turn
  unrelated full-repository, mutation, platform, packaging, or browser audits into completion work.

## Implementation sequence

1. Tighten the parameter UI-type picker's leading inset and update its focused presentation test.
2. Add the closed operation registry, strict input/error/output types, and stable schema command.
3. Add the bounded loopback client, snapshot command, operation-to-V2 apply mapping, and response
   validation.
4. Add canonical snapshot publication, browser reconciliation, push-based diagnostic settling, and
   the focused live-handler acceptance.
5. Run focused tests, changed-scope policy tests, record evidence, and mark this plan implemented.

Stop when the ten acceptance behaviors pass. Do not expand into PyPI packaging, environment
selection, project discovery, session registries, daemon reuse, MCP, terminal streaming, executing
generated Python, offline project mutation, raw HTTP passthrough, shell completion, or broad CLI
framework adoption.

## Completion checklist

- [x] Parameter picker leading inset corrected and focused test updated
- [x] One authoritative closed operation registry and stable schema output
- [x] Strict snapshot and apply commands over the live loopback V2 API
- [x] Every existing authored mutation mapped without raw transport escape hatches
- [x] Revision conflicts preserved without retry
- [x] Explicit bounded diagnostic settling
- [x] Push-only browser synchronization and diagnostic settling
- [x] Strict machine output and stable exit statuses
- [x] Focused and live-handler acceptance tests passing
- [x] `code-policy test --changed` evidence recorded

## Implementation evidence

- The focused workspace presentation test passes with the parameter UI-type picker inset reduced
  from 12px to 8px.
- The focused CLI, contract, and root-command Go tests pass, as do the complete backend Go suite,
  contract generator check, `go vet ./...`, `go build ./...`, and `git diff --check`.
- A temporary real backend accepted CLI snapshot and apply operations against its live coordinator:
  callable creation and `math.sqrt` persistence were visible in canonical snapshots; the unresolved
  callable diagnostic appeared without `import math`; setting the Python prefix to `import math`
  automatically refreshed the callable, retrieved parameter `x`, and cleared the callable
  diagnostic.
- The coordinator now publishes complete canonical snapshots for both authored mutations and
  asynchronous diagnostics. One SSE connection updates an already-open browser and powers
  `--wait-diagnostics`; the former browser timer and CLI ticker were removed.
- `code-policy test --changed` selected and passed the workspace, playground, Python Canvas backend,
  and Python Canvas frontend suites. The command then reported six pre-existing vulnerability
  assessments in `.code-policy.json` that expired on 2026-08-24; this batch does not alter or renew
  those separately governed assessments.
