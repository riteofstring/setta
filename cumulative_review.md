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
