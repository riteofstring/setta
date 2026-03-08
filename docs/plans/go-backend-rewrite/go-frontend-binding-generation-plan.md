# Go Frontend Binding Generation Plan

## Purpose

Execute the selected follow-on from `CURRENT.md`: move frontend-facing Go
HTTP/websocket contracts onto a Go-owned source of truth, without trying to
replace the full Python generation stack in one jump.

## Why This Slice Is Open Now

- The caller-backed Python surface is down to explicitly deferred transports,
  broad omitted project-state mutation tails, and dormant legacy helpers.
- The broad-coverage checklist still marks frontend route/type binding
  generation as Python-owned even for many Go-owned transports.
- The current websocket routes are already Go-owned runtime contracts under
  `internal/wsapi`, but the frontend still hardcodes or indirectly depends on
  Python-owned route constants for some of those callers.

## Scope

Start with explicit route ownership wedges, not full schema reflection.

### Slice 1

- generate a small Go-owned frontend route module for the current websocket
  transport surface owned by Go
- cover:
  - `/ws/frontend`
  - `/ws/listeners/{listenerID}`
  - `/ws/terminals/{projectID}/{sectionID}`
- retarget current direct websocket callers to that generated Go-owned module
- add focused generator and caller tests

### Later Slices

- extend Go-owned generation to caller-backed Go HTTP route constants
  - current landed wedge: API prefix plus the active raw-address bootstrap,
    tools-call, workspace-launch, launcher-home, launcher-management,
    `settaHomeInfo`, and `binaryDownload` route constants
- decide the minimal typed request/response ownership model for Go-backed HTTP
  contracts
  - current landed wedge: active status/meta read endpoint wrappers and
    response types for `backendInitStatus`, `authRefreshStatus`,
    `serverMode`, and `settaHomeInfo`
  - current landed wedge: active workspace-launch endpoint wrappers plus
    request/response types for `createWorkspaceLaunchIntent` and `launch`
  - current landed wedge: active launcher-home endpoint wrappers plus
    request/response types for recent-workspace reads/mutations,
    filesystem-root reads, directory listing, and open-workspace
  - current landed wedge: active launcher-management endpoint wrappers plus
    request/response types for launcher status/setup/repair/remove/update
  - current landed wedge: active attachment download helper endpoint wrappers
    plus request/response types for single and bulk attachment URL reads
  - current landed wedge: active app-config pane endpoint wrappers plus
    request/response types for app-definition read/write/validate flows and
    app-catalog reads
  - current landed wedge: active project-level AI skills/MCP viewer endpoint
    wrappers plus request/response types for `mcpServerRuntimeStatus`,
    `getAppGenSkills`, `getAppGenSkillContent`,
    `upsertAppGenCustomSkill`, and `revealPathInOsFileExplorer`
- keep schema reflection as a bounded tool, not the default owner

## Non-Goals

- replacing every `generatedTypes.ts` surface in one pass
- preserving Python route naming or placeholder shapes where no caller needs
  them
- introducing broad reflection-driven TS schema generation by default
- migrating explicitly deferred terminal share/deployment transport in this
  slice

## Working Decision

Use small generated TS modules from Go-owned route constants first, then widen
only after current callers adopt them cleanly.
