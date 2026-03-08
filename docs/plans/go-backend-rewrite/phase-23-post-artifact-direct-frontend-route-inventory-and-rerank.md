# Phase 23 Post-Artifact Direct Frontend Route Inventory And Rerank

## Purpose

This doc records the rerank after the landed Phase 22 artifact/file-browser
closeout.

Phase 22 removed the last route cluster that the earlier direct-frontend
reranks had identified as both caller-backed and still Python-owned. The next
step was therefore not another implementation slice inside that same track. It
was a fresh audit of the remaining live frontend route callers against current
Go registrations, earlier landed phase docs, and current app/route tests.

The question for this rerank is narrower than the earlier Phase 19 and Phase
21 passes:

- after the landed Phase 22 closeout, is there another caller-backed direct
  frontend route cluster that should become the next Go rewrite phase?

## Current Status

Completed before this inventory:

- Phase 19 project-shell route cluster closeout
- Phase 20 git-read route cluster closeout
- Phase 22 artifact/file-browser route cluster closeout

Current repo status as of 2026-03-10:

- the caller-backed direct frontend AI/chat/transcription surface is Go-owned
  for the current bounded scope
- the caller-backed project-shell, git, artifact, and file-browser route
  clusters are Go-owned for the current bounded scope
- the remaining obvious live frontend route callers now mostly point at route
  families that were moved earlier in Phase 2, Phase 4, Phase 7, or Phase 15
- dormant listener-chat, detached-run, and non-caller-backed default-project
  routes still remain out of scope until a real caller changes that result

Postscript after the next broader rerank:

- the follow-on capability inventory is now recorded in
  `phase-24-caller-backed-capability-gap-inventory-and-rerank.md`
- that broader pass still did not select a new caller-backed backend phase
- this doc should now be read as the closeout of the direct-frontend
  route-cluster track, not as the active planning frontier

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-21-post-git-direct-frontend-route-inventory-and-rerank.md`
- `docs/plans/go-backend-rewrite/phase-22-artifact-and-file-browser-route-cluster-plan.md`
- `docs/plans/go-backend-rewrite/phase-22-ide-artifact-owner-plan.md`
- `docs/plans/go-backend-rewrite/phase-22-share-artifact-session-overlay-plan.md`
- `docs/plans/go-backend-rewrite/phase-4-terminal-run-code-migration.md`
- `docs/plans/go-backend-rewrite/phase-4-deployment-run-code-policy-and-session-overlays.md`
- `docs/plans/go-backend-rewrite/phase-7-deployment-ide-publish-list-transport.md`
- `docs/plans/go-backend-rewrite/phase-7-launcher-home-recent-workspaces-and-directory-browser.md`
- `docs/plans/go-backend-rewrite/phase-7-launch-intent-local-launch-and-bootstrap-handoff.md`
- `docs/plans/go-backend-rewrite/phase-15-plugin-lifecycle-mutation-transport.md`
- `docs/plans/go-backend-rewrite/phase-15-plugin-runtime-read-and-asset-transport.md`
- `backend/setta/terminals/run_code.py`
- `frontend/src`
- `frontend/tests`
- `internal/httpapi`
- `internal/app`

## Inventory Method

1. Start from the post-Phase-22 state where the artifact/file-browser cluster
   is closed.
2. Search current frontend code and tests for live generated-endpoint callers.
3. Compare the live route families with current Go route registrations and app
   wiring instead of assuming that a live caller implies a still-Python owner.
4. Cross-check the suspicious live clusters against earlier phase docs and
   focused route/app tests to separate already-landed route ownership from
   still-missing capability work.
5. Keep dormant generated routes out of scope unless a concrete current caller
   proves otherwise.

## Findings

### 1. The Phase 22 artifact/file-browser cluster is now actually closed

What Phase 22 landed:

- workspace file-browser reads, writes, transfers, and token-backed downloads
- bounded IDE `GET /binary/{contentId}`
- IDE artifact import/cached-read/update/delete ownership
- deployment/share artifact overlay reads, writes, deletes, cleanup, and
  scoped realtime broadcasts

Implication:

- the corrected Phase 21 rerank remains valid
- the selected artifact/file-browser cluster is now complete for the current
  caller-backed surface

### 2. The next obvious live route families are already Go-owned from earlier phases

The post-Phase-22 live caller rerun surfaced route families such as:

- `route_run_code`
- deployment publish/list routes
- launcher home/management/workspace-launch routes
- `route_get_backend_init_status` and `route_get_setta_home_info`
- plugin runtime and lifecycle routes

Those are not new Python-owned clusters.

They already map to landed Go route/runtime ownership under:

- terminal and deployment/share `runCode`
  - `internal/httpapi/terminal_routes.go`
  - `internal/runs`
  - Phase 4 terminal/deployment run docs
- deployment publish/list/latest and deployment session/state routes
  - `internal/httpapi/deployment_ide_routes.go`
  - `internal/httpapi/deployment_routes.go`
  - Phase 7 deployment docs
- launcher home, launcher management, and workspace launch
  - `internal/httpapi/launcher_home_routes.go`
  - `internal/httpapi/launcher_management_routes.go`
  - `internal/httpapi/workspace_launch_routes.go`
  - Phase 2 and Phase 7 launcher docs
- backend status/meta reads
  - `internal/httpapi/status_routes.go`
  - Phase 2 status/meta closeout doc
- plugin runtime, lifecycle, restart, config, and backend routes
  - `internal/httpapi/plugin_routes.go`
  - `internal/httpapi/plugin_backend_routes.go`
  - Phase 15 plugin docs

Route and app coverage already exists for those clusters, including:

- `internal/httpapi/terminal_routes_test.go`
- `internal/httpapi/deployment_ide_routes_test.go`
- `internal/httpapi/deployment_routes_test.go`
- `internal/httpapi/launcher_home_routes_test.go`
- `internal/httpapi/launcher_management_routes_test.go`
- `internal/httpapi/workspace_launch_routes_test.go`
- `internal/httpapi/plugin_routes_test.go`
- `internal/httpapi/status_routes_test.go`
- `internal/app/app_test.go`
- `internal/app/workspace_launch_test.go`

Rerank implication:

- these clusters should stay closed unless a concrete new product/runtime gap
  appears inside them
- they do not justify reopening direct frontend transport planning

### 3. Some remaining Go gaps are capability-level, not route-cluster gaps

The rerun did find a few bounded areas where Go still exposes explicit
unsupported or unavailable behavior in specific paths, for example:

- `runCode` with `cliId`
- managed agent-run / run-chain starts when the corresponding runtimes are not
  wired
- bounded artifact update types that still reject non-caller-backed payloads

Current rerank result:

- none of those surfaced as the next direct frontend route cluster
- some do not have a real current frontend caller on the degraded path
- others are already explicit clean-break product boundaries rather than thin
  transport gaps

Recommendation:

- treat the remaining work here as a broader capability-gap inventory, not as
  another route-cluster phase opened from direct frontend route names alone

### 4. Dormant listener-chat, detached-run, and default-project routes still should not drive the roadmap

Generated routes still exist for:

- listener-chat transport
- detached runs
- default-project selection helpers

Current status:

- the current rerun still did not find a concrete direct frontend caller that
  changes their priority
- they remain out of scope for the next phase under the current clean-break
  rules

## Reranked Outcome

1. There is no new caller-backed direct frontend route cluster to open after
   the landed Phase 22 closeout.
2. The direct frontend route-cluster track is effectively closed for the
   current caller-backed surface.
3. The next planning step should be broader than route transport:
   inventory caller-backed capability gaps and remaining non-direct-frontend
   Python/runtime ownership instead of pretending another obvious route family
   is still missing.

## Decisions Made

- do not invent a Phase 23 implementation slice just to preserve the earlier
  route-cluster cadence
- record the post-Phase-22 outcome explicitly so completed route families do
  not look active again
- keep dormant listener-chat, detached-run, and default-project routes out of
  scope until a real caller appears
- shift the next rerank boundary from direct frontend route transport to
  broader caller-backed capability/runtime inventory

## Next Recommended Step

Run a broader rewrite inventory outside the closed direct frontend route
cluster.

Later outcome:

- completed in `phase-24-caller-backed-capability-gap-inventory-and-rerank.md`

Start from:

- live caller-backed paths that still hit typed Go `unsupported` or
  `unavailable` responses
- remaining Python/runtime ownership that is not primarily a thin route layer
- current frontend and product surfaces that would actually benefit from the
  next slice

Do not reopen artifact/file-browser, git, project-shell, launcher, deployment,
plugin, or completed AI/chat route transport without a concrete new caller or
runtime gap.
