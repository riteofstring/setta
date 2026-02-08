# Runtime Modes: IDE, Share, App

Setta has three runtime modes. IDE mode is the full interactive editor. Share
mode serves a read-only deployment snapshot with per-viewer sessions and policy
gates. App mode serves an app deployment snapshot (AppSpec + theme + assets)
with the same session + policy model.

Share mode and app mode are both "deployment modes": auth is disabled and
stateful routes require a `shareSessionId`.

## Quick comparison
- IDE mode: full editing, LSP, settings + project management, auth-protected, writes to `setta_files`.
- Share mode: deployment snapshot, per-viewer session state in memory, policy gating, no auth, deployment session required.
- App mode: app deployment snapshot (JSON-render AppSpec), per-viewer session state in memory, policy gating, no auth, deployment session required.

## IDE mode (default)
- Started with `setta` (CLI group default).
- Backend uses `setta_files/` for DBE storage (`project.json`, settings, artifacts, code, notifications).
- AuthMiddleware + bootstrap token flow; CLI and frontend websockets are enabled.
- LSP servers, MCP server/client, watchers, and LLM config edits are enabled.
- Project managers use `SessionPersistenceMode.ide_main` and `SessionPersistenceMode.ide_settings`, persisting to disk.

## Share mode (snapshot server)
- Started with `setta share ...` (no `--reload`).
- Requires a share deployment root containing `manifest.json` + `project.json` + `policy.json`.
- No AuthMiddleware; all stateful routes require a share session id.
- `ShareRuntimeState` loads the deployment snapshot and creates per-session copies.
- PasswordParam secrets are stripped from deployment snapshots (`hasSecret` is
  forced false), and `getPasswordParamValue` is blocked in share mode.
- LSP, project CRUD, code edits, file creation, and settings writes are blocked.
- The frontend connects over `/share/frontend`; CLI websockets are disabled.

## App mode (app deployment server)
- Started with `setta app ...` (no `--reload`).
- Requires an app deployment root containing `manifest.json` + `project.json` + `policy.json`.
- No AuthMiddleware; all stateful routes require a share session id.
- `ShareRuntimeState` loads the deployment snapshot and creates per-session copies.
- The frontend renders the app from the published AppSpec referenced by
  `appDefinition.appSpecPath` (copied under `app_specs/` when publishing).
- LSP, project CRUD, code edits, file creation, and settings writes are blocked.
- The frontend connects over `/share/frontend`; CLI websockets are disabled.

## Deployment anatomy (share/app)
- Default location: `setta_files/deployments/<deploymentName>/vN/`.
- Files:
  - `manifest.json` (deploymentName, deploymentVersion, deploymentType, defaultProjectConfigId, optional listener config).
  - `project.json` (project snapshot; app deployments include `appDefinition`).
  - `policy.json` (deployment policy flags).
- Folders:
  - `artifacts/`, `json_sources/`, `code/`.
  - `app_specs/` for app deployments (AppSpec JSON referenced by `appDefinition.appSpecPath`).
  - Optional `listener/app.py` if you publish a listener entrypoint.
- Publishing a deployment copies referenced artifacts/code/json sources into the deployment root and rewrites project state paths to be deployment-relative.

## Deployment runtime root
- If the deployment is under `.../deployments/<deploymentName>/<version>/`, runtime data is stored in `.../deployment_runtime/<deploymentName>/<version>/`.
- If you run from a custom deployment root not under a `deployments/` folder, the runtime folder is created at `<deployment_root_parent>/deployment_runtime/<deploymentName>/<version>/`.
- Run snapshots and share runtime DB locks live under this runtime root.

## Deployment session lifecycle
- A viewer requests a deployment session and receives:
  - Share mode: `POST /share/deployments/current/session` -> `shareSessionId`, `sharePolicy`, `projectMetadata`, `deploymentName`, `deploymentVersion`.
  - App mode: `POST /app/deployments/current/session` -> `shareSessionId`, `appPolicy`, `projectMetadata`, `deploymentName`, `deploymentVersion`.
- The frontend stores the session in `sessionStorage` and sends it via:
  - `X-Share-Session-Id` header on HTTP requests.
  - `shareSessionId` query parameter on websockets.
- Sessions are kept in memory and expire after 30 minutes of inactivity; cleanup runs every 5 minutes and removes session state, terminals, chat managers, listeners, and realtime sequences.
- Missing/unknown sessions return 400/404 on HTTP or close websockets with codes 4400/4404.

## Policy and enforcement
- `policy.json` controls:
  - `allowParamChanges`, `allowVariantChanges`, `allowLayoutChanges`.
  - `allowRun`, `allowLLM`, `allowExternalLinks`, `allowFileDownloads`, `allowMultipleRuns`.
  - `runSnapshotMode` (`ephemeral` or `always`; `never` is rejected for deployments).
- CodeParam edits are always blocked in deployment mode.
- See `docs/reference/share-policy-flags.md` for exact route mapping.

## Runtime behavior in deployment modes (share/app)
- Per-session state is an in-memory copy of the deployment snapshot; updates are scoped to a session and never written back to `project.json`.
- Artifact updates are cached in memory and broadcast only to the active share session; filesystem access is restricted to `artifacts/`, `json_sources/`, and `code/` under the deployment root.
- Runs always use snapshot files under `deployment_runtime/.../share_runs/<shareSessionId>/...`; terminal input is disabled in deployment mode.
- If `runSnapshotMode=ephemeral`, a cleanup loop deletes old run outputs (30 minute TTL). `always` keeps run outputs.
- LLM is only available when `allowLLM=true`; deployment mode uses `ShareChatManager` with an in-memory chat store and no MCP tools.
- If `manifest.json` defines a listener entrypoint and it is enabled, a listener is started per share session; listener emits are gated by `allowParamChanges`.

## Deployment examples

### Example 1: Publish share deployment from IDE, run locally
1. In IDE mode, open "Publish Share Deployment" (or call `POST /share/deployments`) to create a snapshot.
2. Start share mode on the latest deployment:
```
setta share --deployment-name demo-share --latest
```
3. Open the printed Share URL (append `/<ProjectConfigName>` if you want a specific config).

### Example 2: Serve a specific share deployment version on a remote host
```
setta share --deployment-name demo-share --version v3 --host 0.0.0.0 --port 8000 --no-open
```
Point your browser or reverse proxy to `http://<host>:8000`.

### Example 3: Run share mode from a custom deployment root
```
setta share --deployment-root /opt/setta/deployments/demo-share/v5 --host 0.0.0.0 --port 8000
```

### Example 4: Publish app deployment from IDE, run locally
1. In IDE mode, open "Publish App Deployment" (or call `POST /app/deployments`) to create a snapshot.
2. Start app mode on the latest deployment:
```
setta app --deployment-name demo-app --latest
```
3. Open the printed App URL (append `/<ProjectConfigName>` if you want a specific config).

### Example 5: Serve a specific app deployment version on a remote host
```
setta app --deployment-name demo-app --version v2 --host 0.0.0.0 --port 8000 --no-open
```
Point your browser or reverse proxy to `http://<host>:8000`.
