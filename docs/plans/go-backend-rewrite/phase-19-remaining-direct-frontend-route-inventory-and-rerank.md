# Phase 19 Remaining Direct Frontend Route Inventory And Rerank

## Purpose

This doc records the bounded rerank after the landed Phase 18 AI/chat,
managed-chat, transcription-session, and adjacent chat-section closeout work.

Phase 18 removed the last caller-backed direct frontend AI/chat gap under the
current clean-break scope. The rewrite now needs a fresh rerank of the
remaining Python-owned direct frontend routes outside that cluster so the next
phase is selected by real callers and concrete runtime boundaries, not by
historical router layout.

Historical note:

- the direct AI/chat/transcription cluster is now Go-owned for the current
  caller-backed surface
- the adjacent dormant `POST /getChatSectionChatId` route also closed out in
  Go during that work
- the next phase is therefore no longer another AI route slice

## Current Status

Completed before this inventory:

- Phase 15 plugin caller/runtime closeout
- Phase 16 direct LLM config and managed API-key transport
- Phase 17 app-gen skills and custom-skill transport
- Phase 18 caller-backed AI/chat/transcription transport and runtime closeout

Question this inventory answers:

- after the landed Phase 18 closeout, which remaining Python-owned direct
  frontend route cluster should become the next Go rewrite phase?

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-18-remaining-ai-chat-and-transcription-route-inventory-and-rerank.md`
- `docs/plans/go-backend-rewrite/phase-15-plugin-caller-and-runtime-closeout.md`
- `docs/plans/go-backend-rewrite/phase-14-run-chain-caller-and-progress-closeout.md`
- `backend/setta/routers/projects.py`
- `backend/setta/routers/git.py`
- `backend/setta/routers/listener.py`
- `backend/setta/routers/runs.py`
- `tests/routers/test_projects_mode_guard.py`
- `tests/routers/test_name_validation_routes.py`
- `tests/project_state/test_project_config_view_modes.py`
- `frontend/src/state/actions/project/loadProject.ts`
- `frontend/src/state/actions/project/saveProject.ts`
- `frontend/src/components/Panes/Overview/NotificationsArea.tsx`
- `frontend/src/components/Panes/Overview/ProjectOverview/ProjectName.tsx`
- `frontend/src/components/Pages/Project/AppPreview.tsx`
- `frontend/src/components/Modals/DeleteProjectWarningModal/DeleteProjectWarningModal.tsx`
- `frontend/src/state/actions/git.ts`
- `internal/projectstate/registry.go`
- `internal/projectstate/project_metadata_reads.go`
- `internal/projectview/single_config.go`
- `internal/httpapi/project_routes.go`

## Inventory Method

1. Search current frontend code for live generated endpoint callers outside the
   landed Phase 18 AI/chat/transcription cluster.
2. Group the remaining route surface by actual runtime owner instead of Python
   router file.
3. Compare those live callers with the current Go route registrations and
   existing Go runtime foundations.
4. Separate caller-backed route clusters from dormant generated bindings that
   only remain in tests or legacy transport code.
5. Rerank the remaining surface by user-facing dependency and implementation
   boundary, not by raw route count.

## Findings

### 1. The next caller-backed direct frontend cluster is the project shell route surface

These routes still have live direct frontend callers:

- `POST /loadAllProjectMetadata`
- `POST /loadProjectConfig`
- `POST /createProjectConfig`
- `POST /saveProject`
- `POST /saveAsNewProjectConfig`
- `POST /deleteProjectConfigs`
- `POST /setProjectConfigName`
- `POST /getNotifications`
- `POST /deleteNotification`

Current callers:

- `frontend/src/state/actions/project/loadProject.ts`
  - `loadAllProjectMetadata`
  - `loadProjectConfig`
  - `createProjectConfig`
- `frontend/src/state/actions/project/saveProject.ts`
  - `saveProject`
  - `saveAsNewProjectConfig`
- `frontend/src/components/Pages/Project/AppPreview.tsx`
  - `loadProjectConfig`
- `frontend/src/components/Modals/DeleteProjectWarningModal/DeleteProjectWarningModal.tsx`
  - `deleteProjectConfigs`
- `frontend/src/components/Panes/Overview/ProjectOverview/ProjectName.tsx`
  - `setProjectConfigName`
- `frontend/src/components/Panes/Overview/NotificationsArea.tsx`
  - `getNotifications`
  - `deleteNotification`

Current Go foundations already in place:

- `internal/projectstate.Registry` and `internal/projectstate.Runtime`
  - persisted main/settings document ownership
- `internal/projectstate.Document.ProjectConfigMetadata()`
  - deterministic metadata read helper
- `internal/projectview.SingleConfig`
  - direct single-project frontend view materialization
- `internal/httpapi/project_routes.go`
  - established thin project-state transport and `frontendOpId` patterns

What is still missing:

- a Go owner for project-shell load metadata/config reads
- a Go owner for project lifecycle mutations across create/save/save-as/delete
  and rename
- an explicit notification persistence/read/delete owner
- a delete-time terminal cleanup hook above the landed terminal runtime

Implication:

- the next executable rewrite phase should be an explicit project-shell route
  cluster, not another AI/runtime slice

### 2. The git read cluster is active, but it is the next adjacent phase, not the current one

These routes have live current callers in `frontend/src/state/actions/git.ts`:

- `POST /git/status`
- `POST /git/diff`
- `POST /git/log`
- `POST /git/commitDetails`
- `POST /git/commitFileDiff`

Why this is adjacent instead of first:

- the git surface is important, but it is not part of the project shell boot,
  load, save, rename, or delete flow
- it depends on a different runtime boundary: repo-root resolution, subprocess
  execution, payload caps, revision/path validation, and deployment/launcher
  mode policy
- there is no shared implementation dependency that forces git transport to
  move before project-shell route ownership

Rerank:

- keep git as the next adjacent caller-backed direct frontend cluster after
  project shell

### 3. Listener chat routes remain dormant for the current frontend surface

The generated listener-chat endpoints still exist:

- `POST /createChat`
- `POST /getChat`
- `POST /appendChatMessages`
- `POST /deleteChat`
- `POST /setChatSystemPrompt`
- `POST /getAllChatMetadata`
- `POST /runMCPTools`
- `POST /emitChatStreamDelta`

Current status:

- this inventory did not find live direct frontend callers outside generated
  bindings
- current references are backend tests and legacy listener transport
- the user-facing AI/chat path is now the Go-owned managed/external route
  cluster landed in Phase 18

Rerank:

- low priority
- do not open a listener-chat route phase without a concrete new caller

### 4. Detached run routes remain dormant for the current frontend surface

These generated endpoints still exist:

- `POST /runDetached`
- `POST /getRunStatus`
- `POST /cancelRun`

Current status:

- this inventory did not find live direct frontend callers outside generated
  bindings and backend tests
- the remaining dependency is runtime/product level, not a thin transport gap

Rerank:

- low priority
- do not open a detached-run phase without a concrete caller-backed reason

### 5. Two project routes remain non-caller-backed and should not drive the first Phase 19 slice

These project routes still exist in Python:

- `POST /getDefaultConfigName`
- `POST /setAsDefaultProject`

Current status:

- this inventory did not find live direct frontend callers for either route
- they belong to the same broad project-shell owner, but they are not the
  caller-backed part of the surface that should select the first slice

Rerank:

- keep them out of the first Phase 19 slice unless a real caller appears

## Reranked Outcome

1. The next rewrite phase should target the project-shell direct frontend
   route cluster.
2. The first bounded Phase 19 implementation doc should focus on that
   project-shell cluster instead of broadening immediately into git or dormant
   listener/run transport.
3. The git read cluster is the next adjacent caller-backed phase after project
   shell.
4. Listener chat, detached runs, and the non-caller-backed default-project
   routes should remain explicitly out of scope until a real caller changes the
   rerank.

## Decisions Made

- Phase 19 is selected by the project-shell route cluster, not by the dormant
  listener/run surface
- git transport remains important, but it is not the current highest-leverage
  next step
- non-caller-backed default-project routes should not broaden the first Phase
  19 slice

## Verification

- docs and inventory only; no automated tests were run

## Next Recommended Step

- execute `phase-19-project-shell-route-cluster-plan.md`
- start with the smallest caller-backed project-shell slice that reuses the
  landed `projectstate` and `projectview` foundations instead of recreating a
  Python-style project-manager singleton
