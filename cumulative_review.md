## 2026-02-25 13:49:09 PST

- Enforced launch session mode invariants end-to-end by introducing workspace+mode registry lookup and requiring `server_mode` filtering in both pre-spawn reuse and post-spawn wait paths.
- Hardened launcher artifact lifecycle with strict managed-artifact registry checks (platform key allowlist, trusted-root path constraints, protected-root rejection), ownership markers, and transactional uninstall semantics that preserve metadata on artifact-removal failure.
- Replaced channel-string update gating with explicit metadata-backed install source strategy (`uv_tool`, `installer_managed`, `unsupported`) and removed in-app updates for unsupported/manual sources.
- Fixed frontend endpoint contract drift by adding explicit query serialization in endpoint URL building and ensuring launcher recent-workspaces transmits `setta_home` query parameters when provided.
- Added and updated backend unit/integration tests, frontend Vitest coverage, and Playwright launcher-home coverage; targeted test runs passed for the modified areas.

## 2026-02-25 15:04:43 PST

- Unified launcher-home scope handling by introducing shared `settaHome` context propagation across recent workspace actions (open/pin/remove), launcher settings operations (status/setup/repair/remove/update), and backend launcher-status query handling.
- Fixed frontend launcher-origin routing determinism by normalizing route matching before origin resolution so query/hash-bearing launcher endpoints cannot silently fall back to backend origin.
- Removed implicit non-IDE route fallbacks by introducing explicit mode route resolution and preventing app mode from inheriting IDE route elements for `/launching`.
- Hardened artifact installation safety with pre-write artifact path planning/validation, strict filename-component checks for `desktop_entry_name`/`app_name`, and Freedesktop-compatible Linux `.desktop` `Exec=` escaping.
- Made recent workspace persistence transactional and concurrency-safe with file locking plus atomic temp-file replacement, eliminating read-modify-write races and partial-write corruption windows.
- Expanded regression coverage with new/updated backend pytest, frontend Vitest, and Playwright tests validating scoped launcher payload propagation, route/origin behavior, artifact safety constraints, and atomic recents-store behavior.

## 2026-02-25 15:51:14 PST

- Restored cross-origin launcher handoff correctness by making launcher mode resolve `/launching` to workspace launch processing (instead of home redirect), with explicit mode-policy coverage in frontend tests.
- Fixed launcher setup idempotence drift by treating omitted setup fields as patch-like on the backend and by sending current launcher identity settings on frontend reruns, preventing accidental channel/open-mode resets.
- Hardened launcher artifact setup invariants by enforcing one-to-one artifact-key-to-path mapping, rejecting duplicate planned/managed paths, and normalizing installer filesystem failures into typed `ArtifactInstallFailed` errors.
- Unified launcher-home open-workspace scope resolution on backend effective `setta_home` and blocked dot-segment (`.`/`..`) create-path semantics that could escape the intended child-directory invariant.
- Decoupled successful launch/open flows from non-critical metadata persistence by making last-used-workspace updates fail-soft for metadata parse and I/O failures.
- Corrected release automation reliability by replacing PowerShell-incompatible multiline command syntax with argument-array splatting and by selecting repair-break artifacts from fresh post-update launcher status in smoke tests.
- Added regression coverage across backend pytest, frontend Vitest, and Playwright for the above invariants, including route handoff behavior, setup payload stability, dot-segment validation, fail-soft metadata updates, and release script contract checks.

## 2026-02-25 16:19:19 PST

- Converted launcher-home routing policy from ad hoc frontend checks to backend-enforced contracts by adding an explicit `require_launcher_mode` dependency and applying it to launcher-home endpoints.
- Removed duplicated launcher `setta_home` fallback logic by introducing shared backend scope resolution (`resolve_launcher_setta_home`) and wiring it through launcher-home plus launcher management/status routes.
- Simplified launcher-home bootstrap by deleting the redundant `launcherAppMode` probe call and relying on global server-mode routing with direct launcher API initialization.
- Updated backend and frontend regression coverage to lock the new contracts (launcher-only access, blank `setta_home` defaulting, and launcher-home e2e flows without the mode probe route).

## 2026-02-25 17:19:57 PST

- Hardened launch-session reuse by enforcing full runtime identity matching (`settaHome`, `profile`, `settaFilesLocation`/`settaFilesRoot`, `runtimeRoot`) for both reuse and post-spawn session discovery.
- Reworked launcher setup into marker-verified, safer artifact reconciliation with cleanup on metadata-write failures, and persisted canonical `artifactOptions` so setup/repair/update replay platform customization deterministically.
- Removed unsupported manual managed-artifact setup surface from backend request models, CLI options, and docs instead of preserving compatibility for rejected paths.
- Added signed launcher-origin handoff (`lo` + `lop`) across launch and launcher-home bootstrap flows, validated server-side during bootstrap consume, and restricted frontend launcher-origin persistence to `sessionStorage`.
- Tightened frontend endpoint-origin resolution by routing launcher-management/status/home-info/reveal-path traffic to backend origin while keeping launcher-home-specific endpoints plus `/launch` on launcher origin.
- Expanded automated coverage with new and updated backend pytest, frontend Vitest, and Playwright tests for identity reuse, artifact lifecycle safety, launcher-origin proof validation, and routing/storage behavior; targeted suites passed.

## 2026-02-25 17:50:32 PST

- Canonicalized launcher setup intent end-to-end: backend setup now supports tri-state `installArtifacts` omission semantics (preserve existing mode), explicit empty `artifactOptions` now clears prior values, and frontend rerun payloads now always send explicit `installArtifacts` derived from current launcher status.
- Closed recents-store policy gaps by enforcing allowed-root invariants at the persistence boundary (load/write/update), including atomic pruning of stale out-of-policy entries so returned recent workspaces remain actionable.
- Isolated launcher runtime initialization from IDE bootstrap by adding a dedicated launcher-mode initialization path in `SettaFastAPIState` and skipping heavy IDE subsystems/plugins/LSP/MCP startup phases in launcher mode.
- Eliminated release installer version drift by deriving installer version once in CI from tag/input and propagating it to macOS/Windows jobs, plus adding release-mode script guards that fail when installer version is missing/invalid.
- Removed launch-test contract fragility by updating `_wait_for_session` tests to the keyword-only invocation contract, introducing a shared localhost-bind capability gate helper, and adding behavior-level timeout/termination coverage through `launch_workspace_session`.
- Added/updated backend pytest, frontend Vitest, and Playwright coverage for setup intent, recents pruning, launcher-mode init boundaries, release workflow/script contracts, and launcher rerun payload semantics; targeted suites passed.

## 2026-02-25 18:22:01 PST

- Enforced fail-fast native command execution for Windows installer build steps by introducing a shared PowerShell native-invocation wrapper that hard-fails on non-zero exit for WiX compile/link and optional signing.
- Removed macOS launcher wrapper dependency on local Python interpreters for path/JSON handling by replacing inline Python parsing with shell-native path canonicalization and explicit JSON success-contract checks.
- Tightened launcher target validation to require true invokability (existing regular file plus platform-specific executable checks: POSIX execute bit and Windows executable extension policy).
- Hardened Linux desktop artifact generation against field injection by centralizing desktop-entry text sanitization and rejecting control-character payloads for `app_name`.
- Split IDE route-mode guarantees with an explicit full-IDE-runtime guard and applied it to IDE-runtime endpoints that can dereference uninitialized launcher-mode subsystems (`/loadAllProjectMetadata`, `/mcpServerRuntimeStatus`).
- Made session mode a first-class connect contract by emitting `serverMode` in status/list/connect payloads, validating it in remote parsers, and enforcing IDE-only session selection in local/SSH connect/stop workflows.
- Added/updated backend pytest coverage for all above invariants (scripts, metadata/artifacts, mode guards, session contracts) and validated with targeted backend suite runs plus Ruff checks; all targeted tests passed.

## 2026-02-25 18:58:55 PST

- Replaced hand-built macOS `Info.plist` string interpolation with `plistlib` serialization and added icon filename control-character validation so launcher metadata remains parseable for XML metacharacter filenames.
- Hardened Linux desktop-entry rendering by validating `icon_path` through the shared desktop-entry text sanitizer, preventing newline/control-character line injection into generated `.desktop` files.
- Enforced explicit full-IDE-runtime guards on settings load/save routes so launcher mode now fails fast with deterministic `403` contracts instead of deferred-attribute runtime crashes.
- Split launcher `/launching` route composition from IDE wrappers by introducing launcher-safe workspace-launch route kind resolution and rendering launcher handoff without `GlobalWrapper` bootstrap dependencies.
- Centralized frontend endpoint-origin policy into an exported contract/resolver and aligned generated-endpoint tests so `/launcherStatus` is asserted against backend origin under distinct backend/launcher base URLs.
- Added/updated backend pytest, frontend Vitest, and Playwright coverage for plist/desktop artifact sanitization, launcher mode settings guards, launcher `/launching` no-`/loadSettings` behavior, and endpoint-origin contract consistency; targeted runs passed.

## 2026-02-25 20:08:27 PST

- Centralized full-IDE-runtime API policy by adding dedicated full-runtime router classes and migrating runtime-dependent routers (`mcp_tools`, `lsp`, `app_spec_streaming`, `projects`) so launcher-mode requests fail fast with deterministic `403` contracts.
- Made session mode an explicit destructive-action selector for `setta stop` by adding `--server-mode` (default `ide`) and enforcing mode filtering in both local workspace lookup and remote session fetch paths.
- Defined a single native installer behavior contract: macOS `.pkg` and Windows `.msi` now execute launcher bootstrap during install (postinstall/custom action) instead of only shipping helper scripts.
- Aligned release automation with installer contract by adding native-installer smoke jobs on macOS/Windows and gating release asset attachment on smoke success.
- Updated native installer docs to reflect bootstrap-on-install behavior and required `uv` precondition.
- Added/updated backend pytest coverage for full-runtime route policy, launcher-mode blocking, stop mode filtering, and installer/workflow contract assertions; targeted suites passed.

## 2026-02-25 21:58:02 PST

- Replaced launcher handoff trust in raw hash payloads with signed one-time launch-intent tokens (`createWorkspaceLaunchIntent` + `/launch` token consume), including expiry and replay protection.
- Removed legacy hash-payload acceptance in frontend launch parsing, switched cross-origin launcher handoff to tokenized hash fields, and blocked forged legacy `#pl` payload usage.
- Fixed launcher-home/launch parity for Setta files location semantics by introducing a shared backend tri-state normalization helper and preserving omitted-field intent for profile/root-aware launches.
- Made launcher install identity explicit end-to-end by adding `installSource` through CLI/API/scripts/native installer bootstrap paths and removing channel-derived install-source inference.
- Corrected dev bootstrap `osw` behavior by propagating open-switcher intent via redirect query parameter instead of backend-origin sessionStorage side effects.
- Aligned status/stop mode contracts (`status --connect-info` IDE default; `status --list-sessions` unfiltered default; `stop` explicit mode resolution) and updated CLI docs accordingly.
- Refactored release workflow publishing into a single final gated asset-publish job and hardened launcher smoke cleanup/assertions with explicit launcher-mode stop/session checks.
- Added and updated backend pytest, frontend Vitest, and Playwright coverage for the above contracts; targeted backend/Vitest suites passed and targeted Playwright specs passed.

## 2026-02-25 22:45:04 PST

- Replaced mutable global launch-intent tracking with a synchronized `WorkspaceLaunchIntentStore` abstraction and switched launch routes to atomic create/consume semantics with explicit prune behavior.
- Bound workspace launch `returnUrl` to server-owned intent state, validated/canonicalized it at intent creation, and returned canonical `returnUrl` in `/launch` responses for deterministic back-navigation.
- Removed unsigned `plr` trust from launcher hash handoff (token + requested-at only), kept cleanup of legacy hash params, and tightened launch-page return navigation to allowed Setta origins with safe `/home` fallback.
- Fixed endpoint origin policy drift by routing `createWorkspaceLaunchIntent` to launcher origin alongside `/launch`.
- Enforced full-runtime policy consistency by moving `llm` and `agentic` routers onto `SettaFullRuntimeAPIRouter`, ensuring launcher mode fails fast with deterministic `403` instead of deferred-runtime `500`s.
- Added/updated backend unit and integration tests, frontend Vitest coverage, and Playwright workspace-launch coverage for intent-store concurrency, return-url validation, hash tampering, endpoint routing, and launcher-mode runtime guards.

## 2026-02-25 23:12:41 PST

- Added an explicit non-launcher runtime boundary (`require_not_launcher_mode`) with shared router wrappers and migrated launcher-unsafe routers (`artifact`, `attachments`, `terminals` HTTP/WS, `project_manager`) to fail fast with deterministic `403` in launcher mode while preserving share/app behavior.
- Closed launcher/IDE split-origin CORS drift by extending backend CORS policy with launcher-mode loopback origin regex support and optional extra trusted frontend origins (`SETTA_FRONTEND_ORIGINS`), then wiring this policy into server middleware.
- Made launcher session mode an explicit CLI JSON contract (`sessionServerMode`) and updated release smoke logic to derive stop/status mode from that contract instead of hardcoded assumptions.
- Hardened release update validation by requiring `startedNew == true` on post-update relaunch and asserting no stale sessions remain in the expected mode before relaunch.
- Added/updated pytest coverage for router policy enforcement, launcher-mode guards on representative endpoints, launcher CORS preflight behavior (trusted vs untrusted origins), launcher CLI payload contract, and smoke script mode/freshness contracts.

## 2026-02-26 00:01:45 PST

- Closed remaining launcher/full-runtime boundary gaps by migrating `ai` and `listener` routers to full-runtime router wrappers, so launcher-mode calls now fail fast with deterministic `403` before deferred runtime fields are touched.
- Removed CLI auth/api session-selection drift by extending shared mode-selection defaults to `auth` and `api` auto-auth (`ide` by default) and applying one shared session filter path for latest-session resolution.
- Tightened launcher credentialed CORS trust to explicit allowlisted origins only by removing broad loopback regex acceptance; trusted loopback origins must now be configured (for example via `SETTA_FRONTEND_ORIGINS`).
- Added/updated regression coverage across router-policy tests, launcher-mode guard tests with deferred-field sentinels, CLI mode-selection unit/integration tests, and CORS tests for configured vs unconfigured loopback origins.
- Ran `pnpm gcf` and validated targeted suites (`pytest` for touched backend/start/cors/router areas and Playwright launcher-origin workspace-launch spec) with passing results.

## 2026-02-26 09:04:12 PST

- Reworked workspace launch-intent persistence to a file-backed, lock-protected store with hashed token keys, cross-process atomic consume-once semantics, and expiry pruning that survives process restarts.
- Split launch-intent token handling into validation and consumption paths so `/launch` now validates signature/session binding before atomically consuming the stored intent payload.
- Added dynamic trusted frontend-origin persistence driven by verified bootstrap launcher-origin handoff (`lo` + proof), and routed CORS enforcement through `SettaCORSMiddleware` so trusted origins can make credentialed launcher API requests.
- Tightened launcher-mode runtime boundaries by moving detached runs to a non-launcher router policy and explicitly rejecting launcher-mode frontend/python websocket endpoints.
- Fixed Windows launcher wrapper workspace forwarding by quoting `%~1` in the generated `launcher --workspace` call to preserve paths with spaces.
- Expanded regression coverage with new/updated pytest and Playwright tests for trusted-origin storage/CORS behavior, launch-intent durability and cross-instance consume races, websocket/route mode guards, and Windows wrapper quoting.
- Ran `pnpm gcf` in `frontend/` as part of this update.

## 2026-02-26 10:02:03 PST

- Replaced crash-unsafe sentinel lock handling in request-path stores with a shared process-file lock utility and typed store errors, then wired launch-intent and trusted-origin stores to use the same crash-recoverable lock/write path.
- Enforced session-owned trusted frontend-origin state (`session_id -> origin -> exp`) with no backward-compatibility shim, and made CORS/auth trust checks session-scoped and fail-closed on store read failures.
- Aligned trusted-origin lifetime with auth lifecycle by refreshing trusted-origin expiry on auth-cookie mint/refresh paths and writing bootstrap trust entries using the minted auth-cookie expiry.
- Hardened SSH launcher-origin handoff contracts by requiring remote `launcherOrigin` to exactly match the requested origin and requiring `launcherOriginProof` whenever launcher-origin handoff is requested.
- Removed request-time process-global env mutation from `/launch` by introducing `get_setta_paths_without_profile_env()` and switching launch default-path resolution to the non-mutating path.
- Added/updated backend pytest coverage for crash recovery, typed store failure mapping, session trust isolation/lifetime refresh, strict SSH origin checks, and launch env isolation, plus Playwright coverage to ensure trusted bootstrap origin does not widen CORS trust to a different origin.
- Ran `pnpm gcf` in `frontend/` and then validated targeted suites (`pytest` affected backend/auth/router/start tests, Playwright bootstrap launcher-origin spec, and Ruff checks on touched files), all passing.

## 2026-02-26 10:47:26 PST

- Fixed lock-boundary contract leakage by moving parent-directory creation and lock setup inside the typed `acquire_process_file_lock` error boundary so stores consistently surface typed unavailable errors.
- Corrected launcher directory listing cap semantics by counting only valid in-policy entries toward `_MAX_DIRECTORY_ENTRIES` (filter first, cap second), eliminating lexicographic drop-off of later valid directories.
- Hardened macOS install/uninstall wrappers with a shared strict JSON contract validator (structural parse + required-field checks), replacing regex-only `"ok": true` acceptance.
- Added and updated regression coverage across unit/store/route/script levels for lock-parent failure mapping, launch-intent and bootstrap unavailable-error contracts, launcher-directory cap-after-filter behavior, and malformed/missing-field macOS wrapper payload rejection.
- Ran `pnpm gcf` in `frontend/` and validated targeted backend suites (`97 passed`) plus Ruff/shell syntax checks on touched files.
