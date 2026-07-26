# OpenUI Artifact Phase 0 Audit - 2026-07-26

## Scope

This audit reviewed Phase 0 of
[`docs/plans/openui-artifact-system-plan.md`](../plans/openui-artifact-system-plan.md)
as one change. The review range expanded from the requested minimum
`ee1480dcdb2e085403f087614b48f80b1f07db82..3dd90c07a818bb458c939bc8e617666f2fa71017`
to the complete phase range beginning at
`fc84ac1b55cae29e43feb628e6203242678ae667^`, plus the current audit fixes.
`fc84ac1b5` introduced the Phase 0 contract, `7e2abbb14` began its
implementation, and `3c288acc5` was the earlier audit before the loop resumed.

No production artifact contract, schema, tool, persistence path, or renderer
imports `internal/conversation/artifactdoc` or the desktop parser spike. The
desktop parser, generated catalog, and generated corpus are reached only by the
Phase 0 conformance test and benchmark.

## Static Audit And Fixes

The audit inspected the complete grammar, catalog, compiler, safety rules,
generator, generated output, pinned upstream parser implementation, desktop
projection, dependency boundary, fixtures, and verification harness before
running automated checks.

The coherent phase includes the earlier audit fixes for:

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

This final pass additionally fixed:

- the maximum-string fixture omitting the code-string role it claimed to cover
- accepted conformance coverage omitting scalar and object reference
  resolution, alias chains, CRLF input, JSON string escapes, negative and zero
  numbers, and a nested optional object field skipped with `null`
- catalog completeness checks silently accepting an unknown value kind or
  invalid list and number bounds
- the desktop projection test proving optional `null` normalization only at a
  component property, not inside a catalog object
- the live output-quality check accepting the response without proving the
  resolved and escalated metrics, all three weekly chart points, and all three
  team table rows were paired correctly
- the absence of a reproducible upstream-parser benchmark for the required
  parse-time measurement

The accepted corpus now has 16 documents. The rejected corpus has 60 cases and
covers every stable compiler failure code plus the affected syntax, safety, and
limit variants. The live test uses the catalog-owned generation instructions,
requires representative mixed content and every supplied fact in its intended
structure, excludes `OPENAI_API_KEY`, and compiles the returned source with the
Go validator.

## Deterministic Matrix

Commands, each run once after the implementation was stable:

```bash
./scripts/go.sh test ./internal/conversation/artifactdoc \
  -count=1 \
  -run '^Test' \
  -bench '^BenchmarkCompile' \
  -benchtime=1s \
  -benchmem \
  -v

pnpm -C desktop exec vitest run \
  src/renderer/src/features/artifacts/openui-document-parser.test.ts

pnpm -C desktop exec vitest bench \
  src/renderer/src/features/artifacts/openui-document-parser.bench.ts \
  --run

pnpm -C desktop run typecheck
```

Result: all passed.

- catalog generation instructions: 6,150 bytes
- representative tool argument JSON: 1,089 bytes
- representative source: 951 bytes
- representative compile: 40,001 ns/op, 23.77 MB/s
- 64 KiB maximum source compile: 519,667 ns/op, 126.11 MB/s
- desktop conformance: 19 tests passed
- representative upstream parse mean: 0.0298 ms
- 64 KiB maximum-source upstream parse mean: 0.8123 ms

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
- returned structured JSON: 955 bytes
- returned OpenUI source: 816 bytes
- returned source compile: 838.334 microseconds

The returned document compiled on its first and only live invocation. It
contained every requested component; the resolved and escalated metrics; the
W1, W2, and W3 chart points; the Platform, Desktop, and Runtime table rows; and
the required Markdown link, code command, and file reference.

## Remaining Phase 0 Gate

Phase 0 is not complete. The only remaining gate is the required pre-change
Electron artifact performance baseline. It needs a driven Electron session,
was already recorded as unavailable, and this audit did not retry it.

The OpenUI package pin, shadcn/ui Base UI source pin, generated desktop catalog,
parser equivalence corpus, deterministic matrix, parse measurements, and live
output-quality gate are all satisfied. Phase 1 must not start until the
pre-change performance baseline is captured and accepted.
