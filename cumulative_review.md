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
