# Phase 4 Run-Code Param Overrides

## Purpose

This doc narrows the remaining `runCode` planner work to Go-owned
`paramOverrides`.

The terminal runtime, IDE `runCode` transport, generated-entry runs, and
deployment/share overlay routing already exist in Go. The remaining gap is the
override path that Python uses to derive a cloned run state without mutating the
active project state.

## Status

Current repo status as of 2026-03-07:

- Go already owns:
  - IDE `runCode` planning and dispatch under `internal/runs`
  - IDE `runCode` HTTP transport under `internal/httpapi/terminal_routes.go`
  - deployment/share `runCode` runtime selection and policy wiring under:
    - `internal/deployments`
    - `internal/runs/service.go`
    - `internal/httpapi/terminal_routes.go`
- Go currently supports:
  - `sectionVariantOverrides` applied against a cloned document
  - generated-entry runs
  - deployment/share session overlays and run-slot policy
- Go now supports `paramOverrides` for run planning under:
  - `internal/runs/planner.go`
  - `internal/projectstate/section_code_objects.go`
  - `internal/codegen/python_materializer.go`
- Go now supports:
  - generic section code-object value overrides against cloned project state
  - override-aware generated-entry snapshot rendering from in-memory project
    state
  - deployment/share param policy enforcement through the Go planner/runtime
    path
- Go still rejects:
  - `cliId`
  - `PasswordParam` overrides
  - `DropzoneParam` overrides
- Go deployment/share runs now reject:
  - all `paramOverrides` when `allowParamChanges=false`
  - `CodeParam` overrides even when other param changes are allowed
- Python reference behavior for `paramOverrides` is split across:
  - `backend/setta/project_state/base_project_manager.py`
  - `backend/setta/project_state/share_runtime_state.py`
  - `backend/setta/share/policy.py`
  - `tests/project_state/test_run_overrides.py`
  - `tests/project_state/test_share_project_manager.py`

## Scope

This focused plan covers:

- parsing and validating `paramOverrides` keys in Go
- applying param overrides against cloned project state without mutating the
  active runtime document
- rendering generated-entry snapshot content from the overridden project state
  instead of reusing stale on-disk generated files
- enforcing deployment/share param policy from Go-owned sources of truth

## Non-Goals

- `cliId` output transport
- detached-run migration
- broad project-manager parity work outside `runCode`
- heuristic support for param types that Go cannot yet model robustly

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-4-terminal-run-code-migration.md`
- `docs/plans/go-backend-rewrite/phase-4-deployment-run-code-policy-and-session-overlays.md`
- `docs/reference/share-policy-flags.md`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/share_runtime_state.py`
- `backend/setta/share/policy.py`
- `tests/project_state/test_run_overrides.py`
- `tests/project_state/test_share_project_manager.py`
- `internal/runs/planner.go`
- `internal/runs/service.go`
- `internal/projectstate`
- `internal/codegen`

## Working Decisions

- keep override application in project-state-adjacent code, not in HTTP handlers
  - route code should continue decoding transport and mapping errors only
- keep the active project runtime immutable for run overrides
  - overrides must apply to a cloned document/project used only for planning
- when override-driven generated entry output is needed, render it from the
  cloned project state
  - do not trust already-materialized `setta_gen.py` when the override state
    differs from the saved state on disk
- enforce deployment/share param policy from the overridden project snapshot
  - prefer the actual effective code-object type over separate route heuristics
- do not invent fallback behavior for param types with missing Go support
  - if a param type needs runtime support that does not exist yet, return an
    explicit error and document the gap

## Implementation Slices

### Slice 1: Generic Param Override Application

Deliver:

- a Go helper that:
  - parses `sectionId:paramId` keys
  - validates the referenced section/code object in the effective project state
  - applies the override to the cloned project without mutating the live
    document
- planner integration so `paramOverrides` no longer fail up front when the
  referenced param type is supported

Acceptance:

- invalid override keys still fail explicitly
- unknown section/param references fail explicitly
- supported param overrides do not mutate the live project runtime

Status:

- complete

Completed:

- added generic section code-object resolution/value mutation helpers under:
  - `internal/projectstate/section_code_objects.go`
- routed planner override application through cloned project documents
- added focused tests for non-callable section code-object mutation and
  planner-side non-mutation guarantees

### Slice 2: Override-Aware Generated Entry Rendering

Deliver:

- a reusable codegen render entry point for an in-memory project snapshot
- planner support to use rendered generated-entry code/metadata when overrides
  are present

Acceptance:

- generated-entry runs with overrides snapshot the override-derived generated
  code
- non-override generated-entry runs can continue reusing on-disk generated
  files

Status:

- complete

Completed:

- exported an in-memory Python codegen render entry point from
  `internal/codegen/python_materializer.go`
- updated generated-entry planning to render override-derived snapshot content
  from the cloned project when overrides are present
- kept non-override generated-entry planning on the existing on-disk fast path

### Slice 3: Deployment Param Policy Enforcement

Deliver:

- Go-owned deployment/share validation for `paramOverrides`
- explicit handling for deployment-blocked code-object types

Acceptance:

- deployment runs reject param overrides when `allowParamChanges=false`
- deployment runs reject CodeParam overrides explicitly
- route error mapping stays thin and deterministic

Status:

- complete

Completed:

- threaded deployment param policy into `internal/runs/service.go`
- kept route mapping thin in `internal/httpapi/terminal_routes.go`
- added focused HTTP route coverage for:
  - IDE param override success
  - deployment `allowParamChanges=false`
  - deployment CodeParam rejection

## Open Questions

- whether future detached-run migration should reuse the same override helper
  directly or wrap it with detached-run-specific policy

Resolved:

- the first Go slice rejects `PasswordParam` and `DropzoneParam` overrides
  explicitly
  - `PasswordParam` still depends on runtime-backed secret-store writes
  - `DropzoneParam` still depends on runtime-backed normalization semantics
  - Go now fails explicitly instead of pretending those overrides are safe

## Tests

- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/codegen ./internal/projectstate ./internal/runs -count=1 -timeout 180s`
- `GOCACHE=$(pwd)/.gocache ./scripts/go.sh test ./internal/httpapi -run 'TestRegisterTerminalRoutesRejectsUnsupportedRunCodePayloads|TestRegisterTerminalRoutesAcceptsParamOverridesInIDE|TestRegisterTerminalRoutesRejectsDeploymentParamOverridesWhenPolicyDisallows|TestRegisterTerminalRoutesRejectsDeploymentCodeParamOverrides' -count=1 -timeout 180s`

## Next Recommended Step

Mark this focused slice complete and return to the broader rewrite plan.

The remaining `runCode` gap is no longer `paramOverrides`; it is the still
deferred `cliId` output path and later detached-run work. Neither currently
appears higher leverage than the next uncovered focused doc elsewhere in the
rewrite.
