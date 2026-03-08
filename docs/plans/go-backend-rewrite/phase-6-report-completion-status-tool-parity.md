# Phase 6 Report Completion Status Tool Parity

## Purpose

This doc scopes the next bounded Phase 6 slice after the completed
post-project-state utility/read cluster.

The goal is to land Go parity for `report_completion_status` without dragging
in the much larger agent-profile, agent-runner, or plugin/runtime foundation
work.

## Status

Current repo status as of 2026-03-08:

- Phase 6 MCP parity remains the active rewrite phase
- the post-project-state utility/read cluster is complete
- `report_completion_status` is now the smallest remaining Python-owned MCP
  tool gap
- Go does not yet own the completion-report schema or verification-status
  derivation logic used by this tool

## Scope

This slice should cover:

- `report_completion_status`

It should include:

- a bounded Go owner for completion-report validation and
  `verificationStatus` derivation
- MCP parity in `internal/mcpx`
- focused HTTP tool-route and authenticated SSE coverage
- focused owner tests for valid and invalid completion-report payloads

## Non-Goals

- `list_agent_profiles`
- `get_agent_profile`
- `run_agent_profile`
- completion-guard prompt wiring outside the MCP tool behavior already covered
  by the existing runtime
- frontend UI changes
- plugin or UI-setting registry work

## Inputs

- `docs/plans/go-backend-rewrite/phase-6-post-project-state-mcp-surface-inventory.md`
- `backend/setta/mcp/tools/agentic_tools.py`
- `backend/setta/agentic/completion_report.py`
- `tests/agentic/test_completion_report.py`
- `tests/mcp/test_mcp_agentic_project_state_summary_filtering.py`
- `internal/mcpx/server.go`
- `internal/httpapi/mcp_routes.go`
- `internal/app/mcp_test.go`

## Current Python Behavior

1. `report_completion_status`
   - accepts `completionIntent`, `requiresVerification`, optional `taskId`,
     and optional `checkResults`
   - normalizes empty `taskId`, `details`, and `source` strings to `None`
   - rejects empty `checkName`
   - computes `verificationStatus` from the required checks:
     - `passed` when verification is not required
     - `missing` when required verification has no required checks or any
       required check is not passed
     - `failed` when any required check fails
   - is allowed in scoped agentic chat context even though it does not target a
     project-state section mutation

## Working Decisions

- keep this owner local to Go; do not bounce completion-report validation back
  through Python
- model the completion-report input/output explicitly instead of passing opaque
  maps through transport code
- keep the tool transport thin and delegate validation/derivation to the new
  owner
- keep this slice separate from agent-profile runtime work

## Dependency Status

Existing Go owners already available:

- agentic context/session plumbing
- MCP structural tool registration
- authenticated SSE and MCP tool-route coverage harnesses

New owner still needed:

- a bounded completion-report owner for schema validation, normalization, and
  `verificationStatus` derivation

## Verification Targets

- owner-package tests
  - valid completion reports
  - invalid `checkName` handling
  - verification-status derivation
- `internal/mcpx`
  - tool registration and tool-call behavior
- `internal/httpapi`
  - MCP tool-route coverage
- `internal/app`
  - authenticated SSE and tool-route coverage

## Open Questions

- whether the completion-report owner should live under `internal/mcpx` as a
  narrow tool-support type or under a small shared package if later agent-run
  work needs the same model; current recommendation is to keep it small and
  local unless a real second consumer appears

## Next Recommended Step

- implement this bounded `report_completion_status` slice end-to-end before
  moving to the larger agent-profile or UI-setting registry gaps
