# Sharing Mode vs IDE Mode

Setta has two runtime modes. IDE mode is the full interactive editor. Share mode serves a read-only deployment snapshot with per-viewer sessions and policy gates.

## Quick comparison
- IDE mode: full editing, LSP, settings + project management, auth-protected, writes to `setta_files`.
- Share mode: deployment snapshot, per-viewer session state in memory, share policy gating, no auth, share session required.

## IDE mode (default)
- Started with `setta` (CLI group default).
- Backend uses `setta_files/` for DBE storage (`project.json`, settings, artifacts, code, notifications).
- AuthMiddleware + bootstrap token flow; CLI and frontend websockets are enabled.
- LSP servers, MCP server/client, watchers, and LLM config edits are enabled.
- Project managers use `SessionPersistenceMode.ide_main` and `SessionPersistenceMode.ide_settings`, persisting to disk.

## Share mode (snapshot server)
- Started with `setta share ...` (no `--reload`).
- Requires a share deployment root containing `manifest.json` + `project.json`.
- No AuthMiddleware; all stateful routes require a share session id.
- `ShareRuntimeState` loads the deployment snapshot and creates per-session copies.
- LSP, project CRUD, code edits, file creation, and settings writes are blocked.
- The frontend connects over `/share/frontend`; CLI websockets are disabled.

## Share deployment anatomy
- Default location: `setta_files/share_deployments/<deploymentName>/vN/`.
- Files:
  - `manifest.json` (deploymentName, deploymentVersion, defaultProjectConfigId, optional listener config).
  - `project.json` (project snapshot).
  - `share_policy.json` (share policy flags; defaults if missing).
- Folders:
  - `artifacts/`, `json_sources/`, `code/`.
  - Optional `listener/app.py` if you publish a listener entrypoint.
- Publishing a deployment copies referenced artifacts/code/json sources into the deployment root and rewrites project state paths to be deployment-relative.

## Share runtime root
- If the deployment is under `setta_files/share_deployments`, runtime data is stored in `setta_files/share_runtime/<deploymentName>/<version>/`.
- If you run from a custom deployment root, the runtime folder is created at `<deployment_root_parent>/share_runtime/<deploymentName>/<version>/`.
- Run snapshots and share runtime DB locks live under this runtime root.

## Share session lifecycle
- A viewer requests `POST /share/deployments/current/session` and receives:
  - `shareSessionId`, `sharePolicy`, `projectMetadata`, `deploymentName`, `deploymentVersion`.
- The frontend stores the session in `sessionStorage` and sends it via:
  - `X-Share-Session-Id` header on HTTP requests.
  - `shareSessionId` query parameter on websockets.
- Sessions are kept in memory and expire after 30 minutes of inactivity; cleanup runs every 5 minutes and removes session state, terminals, chat managers, listeners, and realtime sequences.
- Missing/unknown sessions return 400/404 on HTTP or close websockets with codes 4400/4404.

## Policy and enforcement
- `share_policy.json` controls:
  - `allowParamChanges`, `allowVariantChanges`, `allowLayoutChanges`.
  - `allowRun`, `allowLLM`.
  - `runSnapshotMode` (`ephemeral` or `always`; `never` is rejected for share deployments).
- CodeParam edits are always blocked in share mode.
- See `docs/share-policy-flags.md` for exact route mapping.

## Runtime behavior in share mode
- Per-session state is an in-memory copy of the deployment snapshot; updates are scoped to a session and never written back to `project.json`.
- Artifact updates are cached in memory and broadcast only to the active share session; filesystem access is restricted to `artifacts/`, `json_sources/`, and `code/` under the deployment root.
- Runs always use snapshot files under `share_runtime/.../share_runs/<shareSessionId>/...`; terminal input is disabled in share mode.
- If `runSnapshotMode=ephemeral`, a cleanup loop deletes old run outputs (30 minute TTL). `always` keeps run outputs.
- LLM is only available when `allowLLM=true`; share mode uses `ShareChatManager` with an in-memory chat store and no MCP tools.
- If `manifest.json` defines a listener entrypoint and it is enabled, a listener is started per share session; listener emits are gated by `allowParamChanges`.

## Deployment examples

### Example 1: Publish from IDE, run locally
1. In IDE mode, open "Publish Share Deployment" (or call `POST /share/deployments`) to create a snapshot.
2. Start share mode on the latest deployment:
```
setta share --deployment-name demo-share --latest
```
3. Open the printed Share URL (append `/<ProjectConfigName>` if you want a specific config).

### Example 2: Serve a specific version on a remote host
```
setta share --deployment-name demo-share --version v3 --host 0.0.0.0 --port 8000 --no-open
```
Point your browser or reverse proxy to `http://<host>:8000`.

### Example 3: Run from a custom deployment root
```
setta share --deployment-root /opt/setta/share_deployments/demo-share/v5 --host 0.0.0.0 --port 8000
```
