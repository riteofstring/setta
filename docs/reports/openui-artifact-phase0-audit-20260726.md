# OpenUI Artifact Phase 0 Audit - 2026-07-26

## Scope

This audit reviewed Phase 0 of
[`docs/plans/openui-artifact-system-plan.md`](../plans/openui-artifact-system-plan.md)
as one change. The review range expanded from the requested minimum
`d66229d4e916111c74c810193f659cab7843d4e4..7e2abbb148cb7167e672c8208ad05c75900e39b3`
to `fc84ac1b55cae29e43feb628e6203242678ae667^..7e2abbb148cb7167e672c8208ad05c75900e39b3`
because `fc84ac1b5` introduced the Phase 0 contract before the implementation
loop resumed.

No production artifact contract, schema, tool, persistence path, or renderer
imports `internal/conversation/artifactdoc`.

## Static Audit And Fixes

The audit inspected the complete grammar, catalog, compiler, safety rules,
fixtures, and verification harness before running automated checks. It fixed:

- unbounded parser recursion before semantic component-depth validation
- bracket-depth tracking that did not verify matching delimiter kinds
- acceptance of non-JSON number forms such as `1.`
- root-involving reference cycles being reported as placement failures
- shared mutable catalog manifest data escaping from `SettaCatalogV1`
- even-backslash Markdown escapes bypassing raw-HTML and image rejection
- Windows drive-relative and scheme-like values passing as workspace paths
- unblocked C1 and bidirectional control characters
- rejected fixtures accepting the expected code anywhere in a diagnostic list
  instead of requiring it as the primary failure
- conformance coverage that did not reach the source, statement, node, string,
  table, chart, and pie boundaries it claimed

The accepted corpus now has 16 documents. The rejected corpus has 60 cases and
covers every stable compiler failure code plus the affected syntax, safety, and
limit variants. The live test uses the catalog-owned generation instructions,
requires representative mixed content and supplied facts, excludes
`OPENAI_API_KEY`, and compiles the returned source with the Go validator.

## Deterministic Matrix

Command, run once after the implementation was stable:

```bash
./scripts/go.sh test ./internal/conversation/artifactdoc \
  -count=1 \
  -run '^Test' \
  -bench '^BenchmarkCompile' \
  -benchtime=1s \
  -benchmem \
  -v
```

Result: passed.

- catalog generation instructions: 6,150 bytes
- representative tool argument JSON: 1,089 bytes
- representative source: 951 bytes
- representative compile: 38,802 ns/op, 24.51 MB/s
- 64 KiB maximum source compile: 505,348 ns/op, 129.68 MB/s

The live test skipped inside this deterministic invocation because
`SETTA_LIVE_CODEX` was intentionally absent. It was run separately once below.

## Live Provider

Command, run once:

```bash
env -u OPENAI_API_KEY SETTA_LIVE_CODEX=1 \
  ./scripts/go.sh test ./internal/conversation/artifactdoc \
  -run '^TestLiveCodexComposesStaticProfileDocument$' \
  -count=1 \
  -v
```

Result: passed with local Codex ChatGPT auth.

- instruction input: 6,150 bytes
- request input: 596 bytes
- returned structured JSON: 817 bytes
- returned OpenUI source: 716 bytes
- returned source compile: 140.042 microseconds

The returned document contained every requested component and supplied fact.
No live row was retried.

## Remaining Phase 0 Gate

Phase 0 is not complete. Existing evidence records the following external or
driven-renderer work as unavailable, and this audit did not retry it:

- pin the candidate OpenUI revision and exact package versions
- record the selected official shadcn/ui upstream revision
- build the equivalent generated React library
- prove every accepted fixture produces an equivalent tree through the pinned
  upstream OpenUI renderer
- capture the required pre-change Electron artifact performance baseline

Those are Phase 0 deliverables and gates. Phase 1 must not start until they are
available and satisfied.
