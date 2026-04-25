Standalone plugin boundary is a hard invariant for this branch.

A Setta plugin may depend on published Setta runtime and SDK packages, but plugin source, plugin tests, plugin build config, and packaged SDK type surfaces must not import repo-local host frontend aliases such as `state/*`, `utils/*`, `openapi/*`, `components/*`, `plugins/*`, `testUtils/*`, `forks/*`, `frontend/src/*`, or host test utilities.

Reviewers must check production source, tests, package manifests, Vite/Vitest aliases, vendored SDK package metadata, and packaged SDK type declarations. If a plugin package cannot plausibly build, typecheck, and test from its own package plus declared dependencies and the Setta runtime/SDK contract, report a blocker finding.

Do not fix clean-checkout plugin packaging by unignoring or committing generated frontend bundles such as `frontend/dist/*`. The plugin wheel/package path must produce those artifacts from tracked plugin-owned source and declared dependencies, or tests must run that plugin-owned build before validating manifest assets.

Do not make `frontend/plugin-sdk/app-subsystem` "standalone" by checking in SDK build artifacts or a large generated declaration fanout. The source SDK package should stay source-first and package-owned: package-local source plus any package-local generated inputs it truly owns. It must not import repo-local host aliases or repo-private generation paths, and it should not require a checked-in `dist/` or a broad checked-in `types/**` tree to count as standalone.

The first-party app subsystem provider is not hostless: it may require Setta at runtime through `setta.plugin_runtime`, local-core, app-subsystem frontend host APIs, and the published app-subsystem frontend SDK. The prohibited dependency is a repo-local host implementation path or alias rather than an explicit Setta runtime/SDK package surface.

The app plugin's plugin-owned frontend build is now a generic manifest-declared contract (`frontend.build.packageManager`), not a host-side plugin-id special case. Do not report the earlier special-case issue unless you can point to a current hardcoded provider/plugin id or other remaining non-generic host coupling.

The checked-in public manifest schema and golden-path authoring guide are now expected to match the runtime manifest contract on this branch. Do not repeat the earlier schema/docs-lag finding unless you can identify a concrete current mismatch among `backend/setta/plugins/schemas/setta.plugin.schema.json`, `docs/guides/plugin-authoring-golden-path.md`, and the runtime manifest/capability handling.

Still valid findings include blocked-but-advertised capability surfaces, remaining repo-local host alias imports, repo-private generation-path dependencies, broken package/build/test flows, stale or non-authoritative plugin packaging, or any concrete current contract mismatch.

When a loop iteration adds or relies on a standalone plugin packaging invariant, run the focused proof command for that invariant before finishing the iteration. In particular, do not leave `test_vendored_app_subsystem_frontend_sdk_matches_source_package_build` or other staged package-root build/typecheck tests failing while claiming the standalone boundary is hardened.
