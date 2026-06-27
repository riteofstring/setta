# Managed Codex Runtime

Setta's de-duplicated Codex history path uses a managed standalone
`codex-app-server` runtime. Production code must not resolve an arbitrary
`codex` binary from `PATH`.

## Strategy

- Runtime strategy: bundled standalone `codex-app-server`.
- Runtime bundle location:
  `codex-runtime/<goos>-<goarch>/codex-app-server` next to the backend
  executable, or the equivalent Electron `Resources/codex-runtime/...` path.
- Runtime packaging hook:
  `./scripts/package_codex_runtime.sh --source <codex-app-server> --resources-dir <Resources dir>`.
  The wrapper defaults `--source` from `SETTA_CODEX_BIN` and writes to
  `build/Resources` when no resources directory is supplied.
- Release integration status: this repository does not yet have a checked-in
  Electron installer or release-packaging pipeline. The packaging hook above is
  the required release step and integrity contract. Setta should not be treated
  as shipping a bundled Codex runtime until the release pipeline invokes that
  hook and includes the resulting `codex-runtime/...` directory.
- Required app-server invocation:
  `codex-app-server --listen stdio:// --session-source app-server`.
- `CODEX_HOME` remains the user's Codex home in production. Setta does not
  override it unless a test explicitly supplies a temporary `CODEX_HOME`.
- `SETTA_CODEX_BIN` is a development and test override only. The override still
  runs through the same resolver and startup probe; it does not bypass
  compatibility requirements.

## Runtime Identity

Current selected reference runtime:

| Field | Value |
| --- | --- |
| Codex source commit | `ab16046c88b2ea9e9af849ab6662129c6becb151` |
| Protocol schema upstream commit | `67009bc53ffc684eaf235c6186df890d35259240` |
| Artifact name | `codex-app-server` |
| Validated platform | `darwin/arm64` |
| Version output | `codex-app-server 0.0.0` |
| Observed artifact path | `/Users/kevin/Documents/AppDevelopment/reference_repos/codex/codex-rs/target/debug/codex-app-server` |
| Observed SHA-256 | `e39d42f1c762b1c2808654cd7db82a5d3e67815ee1e2435019eb48e635557f04` |
| Integrity rule | Each bundled platform directory must include `codex-runtime-manifest.json` with the packaged artifact SHA-256; the resolver verifies that manifest before startup probing. |

The resolver computes the SHA-256 of the selected runtime at startup. Bundled
runtimes must match the sidecar manifest's platform, artifact name, and SHA-256
before Setta executes the selected binary for version or entrypoint checks.
Development overrides still report their SHA-256 in diagnostics, but do not need
a release manifest.

## Startup Probe

Before the shared Codex app-server manager becomes ready, Setta validates:

- the selected executable exists and is executable;
- bundled runtime manifest metadata matches the selected executable, platform,
  source commit, protocol schema commit, version, entrypoint, args, and SHA-256;
- the selected entrypoint exposes an app-server `--listen` interface;
- the entrypoint supports `--session-source app-server`;
- the manager starts the app-server with the explicit app-server session source;
- initialization enables the experimental API capability;
- `thread/list`, `thread/read`, `thread/turns/list`,
  `thread/goal/get`, `thread/goal/set`, `thread/goal/clear`, and
  `thread/settings/update` are available.

The production startup probe requires `thread/list` to succeed. It uses a
syntactically valid missing UUID for the write/read thread methods and accepts
only the known missing-thread JSON-RPC shapes. Method-not-found, invalid
parameter, missing experimental capability, auth, storage, and other provider
errors fail the probe.

If resolution or probing fails, Setta returns a typed incompatible-provider
error containing the selected binary path, resolved path, version output,
entrypoint, app-server args, failed capability, source commit, protocol schema
commit, and selected artifact SHA-256 when available.
