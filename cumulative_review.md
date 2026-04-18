# Cumulative Review
## Recurring Subsystem Invariant Matrix

### Packaged Plugin Backend Launch
- Invariant: Plugin backend launch must follow the manifest entrypoint type; first-party Python LSP packaging must run without requiring end-user Go builds, while Go backends still build explicitly.
- Last finding commit: aa25246aabf24ddfa2da138200f38912c4e8e627
- Proof tests: `internal/app.TestAppBootstrapsDefaultsProfilePackageManagerBasedpyrightOnFirstOpen`; `internal/app.TestAppBootstrapsDefaultsProfilePackageManagerBasedpyrightWithoutGoToolchain`; `internal/plugins.TestServiceRuntimeActivatesFirstPartyBasedpyrightPackageManagerPlugin`; `tests/test_setta_basedpyright_plugin_backend.py`; `tests/start/test_packaged_distribution.py::test_first_party_basedpyright_plugin_wheel_packages_python_backend_only`
- Still unverified: No manual install of a built wheel into a fresh external environment beyond automated package-manager and wheel-build coverage.

### Plugin-Owned Python LSP Settings And Runtime Paths
- Invariant: Python LSP remains plugin-owned and explicitly selected; effective basedpyright settings come from plugin schema defaults plus plugin runtime config, and first-party selection must include `settaFilesRoot` in `basedpyright.analysis.extraPaths`.
- Last finding commit: aa25246aabf24ddfa2da138200f38912c4e8e627
- Proof tests: `internal/plugins.TestServiceLanguageServerSpecsIncludesFirstPartyBasedpyrightDefaults`; `internal/plugins.TestServiceLanguageServerSpecsMergesConfiguredBasedpyrightExtraPathsWithSettaFilesRoot`; `internal/app.TestBootstrapWorkspaceDefaultsInstallProfileWritesMissingPythonSelection`
- Still unverified: No manual workspace session proving completions and diagnostics against a real selected plugin beyond the automated LSP/bootstrap coverage.

### Plugin Config Schema Ownership
- Invariant: Plugin config schema loading and default extraction must have one shared owner used by config write, runtime metadata, and LSP settings construction.
- Last finding commit: aa25246aabf24ddfa2da138200f38912c4e8e627
- Proof tests: `internal/plugins.TestServiceLanguageServerSpecsIncludesFirstPartyBasedpyrightDefaults`
- Still unverified: No dedicated regression test yet asserts the shared-owner path across both runtime descriptor emission and config-write validation.

### Plugin Backend Refresh Rollback Fidelity
- Invariant: Plugin backend refresh snapshots must deep-clone `lsp.LanguageServerSpec.Settings` so rollback restores the exact pre-refresh spec state.
- Last finding commit: aa25246aabf24ddfa2da138200f38912c4e8e627
- Proof tests: `internal/app.TestCloneLanguageServerSpecsDeepCopiesSettings`; `internal/app.TestRollbackRefreshTransitionRestoresLanguageServerSettings`
- Still unverified: No manual restart/disable cycle was forced outside unit coverage.

### Explicit-Spec-Only LSP Router
- Invariant: The router must start from explicit selected specs only; there is no implicit Python fallback and no hidden bootstrap path outside selected plugin specs.
- Last finding commit: aa25246aabf24ddfa2da138200f38912c4e8e627
- Proof tests: `internal/lsp.TestRouterInitializesFromExplicitSpecsOnly`; `internal/lsp.TestRouterReplaceAdditionalSpecsRefreshesPluginLanguages`
- Still unverified: No browser verification was run because no UI behavior changed in this iteration.

## 2026-04-18 20:10:39 PDT
Fixes applied:
- Replaced the first-party basedpyright probe backend with a packaged Python entrypoint and taught backend launch/probe/runtime paths to resolve Go or Python backends from one owner path.
- Restored plugin-backed basedpyright runtime parity by merging `settaFilesRoot` into effective `analysis.extraPaths`, centralized plugin config schema default extraction, preserved refresh rollback settings fidelity, and removed dead implicit-router bootstrap scaffolding.
- Reduced `scripts/build-runtime-break-shortlist.py` complexity to satisfy the current quality gate without changing its diagnostic classification behavior.

Tests added or upgraded:
- Added focused Go coverage for package-manager defaults bootstrap without Go, basedpyright runtime activation, `extraPaths` merging, refresh rollback cloning, and explicit-spec router initialization.
- Added pytest coverage for the first-party basedpyright plugin backend probe and for wheel contents that now package only the Python backend entrypoint.

Verification run:
- `./scripts/go.sh test ./internal/plugins -run 'TestServiceRuntimeActivatesFirstPartyBasedpyrightPackageManagerPlugin|TestServiceLanguageServerSpecsIncludesFirstPartyBasedpyrightDefaults|TestServiceLanguageServerSpecsMergesConfiguredBasedpyrightExtraPathsWithSettaFilesRoot' -v`
- `./scripts/go.sh test ./internal/app -run 'TestBootstrapWorkspaceDefaultsInstallProfileWritesMissingPythonSelection|TestAppBootstrapsDefaultsProfilePackageManagerBasedpyright(OnFirstOpen|WithoutGoToolchain)|TestCloneLanguageServerSpecsDeepCopiesSettings|TestRollbackRefreshTransitionRestoresLanguageServerSettings' -v`
- `./scripts/go.sh test ./internal/lsp -run 'TestRouterInitializesFromExplicitSpecsOnly|TestRouterReplaceAdditionalSpecsRefreshesPluginLanguages' -v`
- `source activate.sh && pytest tests/test_setta_basedpyright_plugin_backend.py tests/start/test_packaged_distribution.py -k basedpyright`
- `pnpm -C frontend gcf`
- `./check_quality.sh`
- Browser verification: not run; no UI behavior changed in this iteration.

Residual risks / verification gaps:
- Packaged/defaults behavior is covered by automated package-manager and wheel tests, but not by a manual fresh-machine wheel install.
- No end-to-end manual editor session was run to observe basedpyright diagnostics/completions after selection and restart.
