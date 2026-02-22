## 2026-02-25 13:49:09 PST

- Enforced launch session mode invariants end-to-end by introducing workspace+mode registry lookup and requiring `server_mode` filtering in both pre-spawn reuse and post-spawn wait paths.
- Hardened launcher artifact lifecycle with strict managed-artifact registry checks (platform key allowlist, trusted-root path constraints, protected-root rejection), ownership markers, and transactional uninstall semantics that preserve metadata on artifact-removal failure.
- Replaced channel-string update gating with explicit metadata-backed install source strategy (`uv_tool`, `installer_managed`, `unsupported`) and removed in-app updates for unsupported/manual sources.
- Fixed frontend endpoint contract drift by adding explicit query serialization in endpoint URL building and ensuring launcher recent-workspaces transmits `setta_home` query parameters when provided.
- Added and updated backend unit/integration tests, frontend Vitest coverage, and Playwright launcher-home coverage; targeted test runs passed for the modified areas.
