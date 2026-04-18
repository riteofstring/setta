## 2026-04-17 23:39:41 PDT

Summary:
- Consolidated review findings were valid. The branch had three real issues: broken first-party plugin packaging for package-manager discovery and `setta[defaults]`, a basedpyright interpreter-resolution regression introduced by pluginization, and lossy LSP-spec cloning during plugin-runtime refresh rollback.
- I implemented the fixes rather than carrying the review notes forward as open findings.

Fixes applied:
- Reworked `plugins/setta-basedpyright` packaging so the wheel installs a package-scoped plugin root under `setta_basedpyright/` instead of dropping plugin assets into site-packages root. This makes `importlib.metadata.distributions(...).files` expose the manifest path and gives discovery a unique plugin root.
- Updated `scripts/build_python_distribution_with_go_binaries.sh` so wheel builds also emit the first-party basedpyright plugin wheel into the same output directory. This makes the normal repo build/upload flow produce both artifacts needed by the root `defaults` extra.
- Moved interpreter ownership back to the host runtime path. Backend probing now injects the authoritative resolved `SETTA_PYTHON` when available, and the plugin backend itself now only consumes an explicit command override or configured/injected interpreter instead of maintaining a second weaker resolver.
- Centralized `LanguageServerSpec` cloning in `internal/lsp` and switched plugin-runtime refresh/rollback to use the canonical deep clone, preserving nested `Settings` across refresh failure and rollback paths.
- Removed the dead `InstallProfile.PackageSpecs` field from the defaults profile surface.

Tests added or upgraded:
- Go unit coverage for backend probe environment injection.
- Go unit coverage for canonical deep cloning of language-server specs and refresh rollback preservation.
- Go integration coverage for real first-party plugin wheel discovery via `pythonenv.Runtime.PluginDistributions`.
- Go integration coverage for defaults-profile bootstrap using a real installed plugin wheel instead of a handwritten fake site-packages layout.
- Python packaging coverage for:
  - wheel-build script wiring that now includes first-party plugin wheel output;
  - local wheelhouse installation of `setta[defaults]`;
  - continued packaged-boundary metadata assertions.

Verification run:
- Focused Go tests for `internal/app`, `internal/plugins`, `internal/lsp`, `internal/pythonenv`, and `plugins/setta-basedpyright/backend`.
- `source activate.sh && pytest tests/start/test_distribution_script_wiring.py tests/start/test_packaged_distribution.py`
- `./check_quality.sh`

Outcome:
- The reviewed regressions are fixed in this branch snapshot.
- No unresolved findings from this review pass remain recorded here.

## 2026-04-18 00:34 PDT

Summary:
- Consolidated review findings were valid. This branch still had six concrete problems: stale Python-current-process test scaffolding that no longer matched pluginized LSP ownership, missing host-provided `setta_files` import roots in selected basedpyright settings, incorrect short-flag handling in the Python distribution build wrapper, header banner UX that inferred language-server readiness from plugin discovery instead of applied runtime state, lost `~` and `$HOME` expansion for explicit basedpyright launcher overrides, and soft acceptance of malformed plugin schema JSON.
- I implemented the fixes directly and removed superseded test-only and compatibility code instead of preserving the reviewed issues as open findings.

Fixes applied:
- Removed stale current-process test coverage that asserted deleted implicit-Python-LSP behavior, then rewrote router and app diagnostics tests to use explicit basedpyright specs and pluginized expectations.
- Added a focused `internal/lsp` helper for building basedpyright settings roots and updated plugin language-server selection to merge host-owned runtime `extraPaths`, including the authoritative `setta_files` root, into selected basedpyright settings.
- Reworked plugin runtime status reporting so the backend owns selected language-server desired-versus-applied state, exported that state through plugin status responses, regenerated the frontend contract surface, and simplified the header banner to render from backend truth instead of frontend inference.
- Restored explicit command-path normalization for the first-party basedpyright backend so `SETTA_LSP_COMMAND` and `SETTA_PYTHON` continue to support `~` and `$HOME` paths.
- Tightened plugin manifest loading so malformed schema JSON is treated as an invalid plugin input instead of silently dropping default settings.
- Fixed the Python distribution build wrapper so short `python -m build` flags such as `-s`, `-w`, and `-o` preserve the caller’s requested artifact behavior.

Tests added or upgraded:
- Go unit and integration coverage for selected-language-server apply state, invalid schema handling, basedpyright settings merging, and updated watch-code/generated-code diagnostics expectations.
- Go plugin-backend coverage for command-path normalization with `~` and `$HOME`.
- Python script-wiring coverage for short build flags.
- Frontend unit coverage for the backend-owned language-server banner state model.
- Playwright coverage for the language-server status banner flow.

Verification run:
- `./scripts/go.sh test ./internal/lsp -count=1`
- `./scripts/go.sh test ./internal/app -run 'TestCodeUpdateServiceSetCodePublishesMissingArgDiagnosticsForBoundWatchCodeCallable|TestCodeUpdateServiceSetCodePublishesMissingArgDiagnosticsForBoundWatchCodeCallableWithoutRematerialize|TestCodeUpdateServiceSetCodeDoesNotLeaveGeneratedImportErrorForBoundWatchCodeModule|TestCodeUpdateServiceSetCodePublishesMissingArgDiagnosticsWhenWatchCodeSignatureChangesWithoutGeneratedCodeDiff|TestAppPluginRuntimeReportsSelectedLanguageServerApplyState' -count=1`
- `./scripts/go.sh test ./internal/plugins -run 'TestValidatePluginManifestPaths|TestServiceStatusIncludesRegisteredLanguageServers|TestFirstPartyBasedpyrightLanguageServerContract/link_discovery_selection_and_lsp_features' -count=1`
- `cd plugins/setta-basedpyright/backend && ../../../scripts/go.sh test . -count=1`
- `source activate.sh && pytest tests/start/test_distribution_script_wiring.py -k 'distribution_helper and (short or skip_cleanup or cleanup_by_default)'`
- `pnpm -C frontend exec vitest run src/components/AppHeader/LanguageServerStatusBanner.test.tsx src/plugins/runtime.test.ts`
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- The targeted new Playwright spec was added but the earlier direct run remained blocked by an unrelated isolated-project bootstrap failure before the banner assertions executed.

Outcome:
- The reviewed regressions are fixed in this branch snapshot.
- No unresolved findings from this review pass remain recorded here.
