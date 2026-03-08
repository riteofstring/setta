# Phase 21 Post-Git Direct Frontend Route Inventory And Rerank

## Purpose

This doc records the bounded rerank after the landed Phase 20 git-read
closeout.

Phase 20 removed the adjacent caller-backed direct frontend git gap under the
current clean-break scope. The rewrite then needed a fresh rerank of the
remaining Python-owned direct frontend routes so the next phase was selected
by real callers, not by leftover generated bindings or historical router
shape.

Correction:

- the first post-git pass was too narrow and incorrectly concluded that no
  remaining caller-backed direct frontend route cluster existed
- a rerun against the live frontend, Python router/tests, and current Go route
  registrations found that the artifact and file-browser cluster is still
  actively caller-backed and still Python-owned
- this doc now records that corrected outcome, and Phase 22 is the follow-on
  plan created from it

Postscript after the landed Phase 22 Slices 1 and 2:

- the rerank in this doc was correct, but the status of the selected cluster
  has since changed
- Go now owns the workspace file-browser routes plus `GET /binary/{contentId}`
- Go now also owns the bounded IDE artifact import/cached-read/mutation
  surface
- the remaining Phase 22 gap is now only the share/deployment artifact overlay
  follow-on for that same cluster

## Current Status

Completed before this inventory:

- Phase 19 project-shell route cluster closeout
- Phase 20 git read route cluster closeout

Question this inventory answers:

- after the landed Phase 20 closeout, is there another caller-backed direct
  frontend route cluster that should become the next Go rewrite phase?

Current repo status as of 2026-03-10:

- the direct project-shell route cluster is Go-owned for the current
  caller-backed surface
- the direct git-read route cluster is Go-owned for the current caller-backed
  surface
- the Phase 22 Slice 1 workspace file-browser and binary-download subset is
  now Go-owned
- the remaining direct caller-backed gap is the artifact import/cached-read/
  mutation subset selected by this rerank
- listener-chat, detached-run, and default-project routes still exist in
  Python-generated bindings, but they still do not have a caller-backed reason
  to drive the next phase

## Inputs

- `docs/plans/go-backend-rewrite/go-backend-rewrite-plan.md`
- `docs/plans/go-backend-rewrite/phase-20-git-read-route-cluster-plan.md`
- `docs/plans/go-backend-rewrite/phase-19-remaining-direct-frontend-route-inventory-and-rerank.md`
- `backend/setta/routers/artifact.py`
- `backend/setta/routers/binary.py`
- `backend/setta/routers/listener.py`
- `backend/setta/routers/runs.py`
- `backend/setta/routers/projects.py`
- `backend/setta/types/routes.py`
- `tests/routers/test_file_browser_routes.py`
- `tests/routers/test_share_artifacts.py`
- `docs/reference/file-browser-pane.md`
- `frontend/src/utils/generatedEndpoints.ts`
- `frontend/src/utils/generatedTypes.ts`
- `frontend/src`
- `frontend/tests`
- `internal/httpapi`
- `internal/app/app.go`

## Inventory Method

1. Start from the post-Phase-20 direct route inventory and remove the landed
   git cluster from the remaining surface.
2. Search current frontend code for live callers of the remaining generated
   routes, not only the previously reranked listener/detached/default-project
   subset.
3. Read the current Python router/tests for any cluster with live callers and
   compare them with the current Go route registrations.
4. Separate generated endpoint availability from real current callers.
5. Rerank only the route clusters that still have a concrete caller-backed
   reason to move now.

## Findings

### 1. The git-read cluster is now complete and should stay closed

What landed in Phase 20:

- `POST /git/status`
- `POST /git/diff`
- `POST /git/log`
- `POST /git/commitDetails`
- `POST /git/commitFileDiff`

Implication:

- there is no remaining caller-backed direct frontend git transport gap under
  the current clean-break scope

### 2. The artifact and workspace file-browser cluster is still caller-backed and should become the next phase

These routes drove Phase 22 because they had live direct frontend callers:

- `POST /checkIfFileExists`
- `POST /checkWorkspaceInitialized`
- `POST /getFileBrowserRoot`
- `POST /getFolderContents`
- `POST /getFileBrowserDownloadUrls`
- `POST /getFileBrowserFileContent`
- `POST /getFileBrowserFileStat`
- `POST /writeFileBrowserFileContent`
- `POST /transferFileBrowserEntry`
- `GET /fileBrowser/{token}`
- `POST /importFilesToArtifacts`
- `POST /loadCachedImageArtifacts`
- `POST /loadCachedChartData`
- `POST /loadCachedBrushStrokes`
- `POST /loadCachedDrawAreaLayerItemTransform`
- `POST /updateArtifacts`
- `POST /deleteArtifacts`
- `GET /binary/{contentId}`

Current callers include:

- `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserPane.tsx`
- `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserSpreadsheetEditor.tsx`
- `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserUniversalPreview.tsx`
- `frontend/src/components/Section/Layouts/BrowserArea.tsx`
- `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatCore.tsx`
- `frontend/src/components/Chat/useChatAttachmentManager.ts`
- `frontend/src/components/Params/ParamUIs/DropzoneInput.tsx`
- `frontend/src/components/App/appRegistry.tsx`
- `frontend/src/state/hooks/artifacts.ts`
- `frontend/src/utils/nativeFileImport.ts`
- deployment publish modals and the Home workspace browser

Current Go ownership status after the landed Phase 22 Slices 1 and 2:

- `internal/filebrowser` plus thin `internal/httpapi` transport now own the
  workspace file-browser subset
- `internal/binary` now owns both upload storage and bounded IDE binary
  download transport for the active file-browser preview/editor callers
- `internal/artifacts` plus thin `internal/httpapi` transport now own the
  bounded IDE artifact import/update/delete and cached-read surface
- only the share/deployment artifact overlay behavior remains Python-owned in
  this cluster

Rerank result that remains valid:

- this was the actual next caller-backed direct frontend route cluster
- its remaining work is now the Phase 22 artifact-owner follow-on, not a new
  rerank away from the cluster

### 3. Listener-chat routes still have no live direct frontend callers

Generated routes still exist:

- `POST /createChat`
- `POST /getChat`
- `POST /appendChatMessages`
- `POST /deleteChat`
- `POST /setChatSystemPrompt`
- `POST /getAllChatMetadata`
- `POST /runMcpTools`
- `POST /emitChatStreamDelta`

Current status:

- current searches found generated endpoint exports, but no live direct
  frontend callers in `frontend/src` or `frontend/tests`
- the active user-facing AI/chat path remains the Go-owned managed/external
  transport landed earlier

Rerank:

- do not open another listener-chat transport phase without a concrete caller

### 4. Detached-run routes still have no live direct frontend callers

Generated routes still exist:

- `POST /runDetached`
- `POST /getRunStatus`
- `POST /cancelRun`

Current status:

- current searches found generated endpoint exports, but no live direct
  frontend callers in `frontend/src` or `frontend/tests`
- the remaining detached-run question is runtime/product level, not an active
  direct transport gap

Rerank:

- do not open a detached-run phase without a concrete caller-backed reason

### 5. Default-project routes remain non-caller-backed

Generated/project routes still exist:

- `POST /getDefaultConfigName`
- `POST /setAsDefaultProject`

Current status:

- current searches found no live direct frontend callers for either route
- they remain part of the broader project-state surface, but they should not
  drive the next rewrite phase without an actual caller

Rerank:

- keep them out of the next phase unless a new caller appears

## Reranked Outcome

1. The next Go rewrite phase after Phase 20 should be the artifact and
   workspace file-browser route cluster.
2. Listener-chat, detached runs, and default-project routes should remain out
   of scope until a concrete caller changes the rerank.
3. The direct frontend route cluster is not closed yet; the earlier
   post-git closeout conclusion was stale.

## Decisions Made

- correct the stale post-git rerank instead of preserving the mistaken
  closeout
- select the artifact and file-browser cluster as the next caller-backed phase
- create a new implementation doc for that phase instead of jumping straight
  into a mixed file-browser/artifact rewrite without a bounded plan
- do not broaden scope into dormant generated listener or detached-run
  surfaces without a caller-backed reason
- keep dormant default-project transport out of the selected next phase

## Verification

- inventory only; direct caller searches run through `rg` and the relevant
  Python router/tests/docs were reread

## Next Recommended Step

- continue Phase 22 with Slice 3 for share/deployment artifact overlay
  ownership only if the current deployment caller surface still requires it
- keep listener-chat, detached runs, and default-project transport closed
  unless a new concrete caller appears
