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
