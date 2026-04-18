# Python Language Server Pluginization Plan

## Goal

Move Python language-server support out of the built-in app runtime and into
plugins, starting with `basedpyright`, while establishing a generic
language-server selection model that also works for other languages and a
testing model that works when features are no longer implicitly built in.

This plan is intentionally not compatibility-constrained.

- There are no existing users to migrate.
- We do not need backward-compatibility shims.
- We do not need legacy settings support.
- We do not need dual built-in/plugin paths.
- We should prefer a clean end state over a staged compatibility layer.

## Desired End State

- The app core does not hardcode a built-in Python language server.
- Language servers are provided by plugins.
- The selection model is generic across languages, even though Python is the
  first target.
- Multiple plugins may provide a language server for the same language.
- Workspace settings explicitly select which plugin is active for each
  language.
- Workspace settings distinguish "no choice has been made yet" from "the user
  explicitly wants no language server".
- For the first cut, changing a workspace language-server selection does not
  need to hot-apply live. It may require an explicit language-server restart or
  equivalent refresh if that is the simpler implementation, but the required
  user action must be clear in the product UI.
- Language-server-specific settings stay plugin-owned and remain in the
  existing Plugins UI/plugin-config flow for now. Integrating them into the
  main settings page is future work.
- One plugin package corresponds to one language-server implementation for now.
- `basedpyright` becomes a first-party plugin rather than a direct built-in
  runtime dependency.
- First-party plugin implementations live under the top-level `plugins/`
  directory as normal plugin package roots rather than under the core app
  runtime packages.
- A curated "defaults" install profile can install a known-good plugin set for
  supported packaging flows, including the default Python language-server
  plugin.
- If defaults are installed and a workspace has no `python` key yet under
  `languageServer.selectedByLanguage`, the first workspace open writes the
  default Python selection into workspace settings so Python completion works
  immediately.
- If a user later clears the Python selection, Setta leaves it cleared. "No
  Python language server" is a valid long-term workspace state.
- Tests no longer assume that built-in features always exist. They explicitly
  choose between:
  - core-without-plugin coverage
  - plugin contract coverage
  - default-profile integration coverage

## Current Constraints

The current architecture supports plugin-provided language servers for
additional languages, but not for Python replacement or generic same-language
selection.

Current blockers:

- The LSP router still creates a built-in Python base spec.
- Plugin language servers are only additive to the built-in spec set.
- Plugin backend probing rejects Python as a plugin language-server target.
- Same-language plugin registrations are treated as an ambiguity error.
- Built-in settings/defaults still hardcode the `basedpyright` settings branch.
- Packaged Python dependencies still include `basedpyright` directly.

Those constraints mean the current model is "built-in Python plus optional
plugin languages", not "plugins own language-server selection".

## Non-Goals

- Do not preserve the current built-in Python LSP path.
- Do not support old settings formats.
- Do not add fallback heuristics such as "pick whichever Python language-server
  plugin is installed".
- Do not silently auto-resolve same-language conflicts.
- Do not keep `basedpyright` both built in and plugin-provided.
- Do not add a privileged first-party plugin runtime path.
- Do not create synthetic warnings that look like LSP diagnostics.
- Do not make every plugin test run through the full default-plugin bundle.

## Design Rules

- Language-server ownership should be explicit.
- Language-server selection should be deterministic, not heuristic.
- The selection model should be generic across languages, even though Python is
  the first implementation target.
- The core app should work correctly with no Python language-server plugin
  installed.
- "No language server selected" is a valid steady state, not only a temporary
  misconfiguration.
- Selection state should distinguish "never chosen" from "explicitly none".
- Users select a language server per language, even when one plugin supports
  multiple languages.
- For the first cut, selection changes do not need live hot-swap behavior. An
  explicit language-server restart or equivalent refresh is acceptable if that
  keeps the implementation simpler, but the UI must make the required action
  obvious.
- Language-server-specific settings should remain plugin-owned config, not
  fields in the main app settings JSON. For now they should stay in the
  existing Plugins UI/plugin-config flow rather than the main settings page.
- The defaults profile is a product choice, not a hidden runtime assumption.
- The defaults profile may bootstrap an initial workspace selection once, but
  it must never silently re-apply a selection after the user clears it.
- Plugin tests should be isolated by default.
- Cross-plugin coverage should exist, but only in a narrow integration lane.
- First-party plugins should use the same runtime path as third-party plugins
  whenever practical.
- In this repo, first-party plugin source should live under `plugins/` as real
  plugin package roots, not under `internal/` or `backend/setta/` except for
  shared core APIs they consume.
- When language-server features are unavailable, the app should explain why via
  normal product UI on the main project page, not through synthetic LSP
  diagnostics.

## Target Model

### 1. Language-Server Selection, Not One-Spec-Per-Language

Replace the current "one language -> one spec" assumption with a
language-server selection model.

For each language:

- multiple plugins may register a language server for the same language
- workspace settings store the selected plugin id for that language
- only one selected plugin may be active for that language at a time
- only the selected registration is handed to the live LSP router

Selection is per language even when one plugin supports multiple languages. A
single plugin may be selected for Python and left unselected for Bash.

For now, the selection identity should be the plugin id. We should not add a
separate `languageServerId` yet because one plugin package corresponds to one
language-server implementation for now.

A single language-server implementation may still register support for multiple
languages when that is how the upstream server works. What we are not allowing
is one plugin package exposing two different alternative language-server
implementations.

This keeps the runtime deterministic and avoids the current ambiguity error as
soon as multiple same-language plugins exist.

### 2. No Built-In Python Language Server

Remove the built-in Python spec from the core LSP router.

Instead:

- the router should start with no Python language server unless one is
  selected
- plugin runtime refresh should supply only the selected language-server spec
  for each language
- Python LSP features should be unavailable when no Python language server is
  selected

That is the correct product behavior once Python LSP is a plugin concern.

### 3. Clean Selection and Settings State

Introduce a small explicit settings surface for language-server selection.

Recommended shape:

- a Go-owned language-server selection branch keyed by language
- each language key is one of:
  - missing: no choice has been made yet
  - a plugin id string: that plugin is selected for the language
  - `null`: the user explicitly selected "no language server"
- plugin-specific settings remain plugin-owned config rather than main app
  settings JSON
- plugin-specific settings stay in the existing Plugins UI/plugin-config flow
  for now rather than the main settings page

Example shape:

```json
{
  "languageServer": {
    "selectedByLanguage": {
      "python": "setta-basedpyright",
      "bash": null
    }
  }
}
```

For Python, the important behavior is:

- selection is explicit in workspace settings
- a missing `python` key means the workspace has never chosen a Python
  language server yet
- `python: null` means the user explicitly chose "no Python language server"
- defaults installation may write an initial Python selection on first
  workspace open only when the `python` key is missing
- if the user later clears the Python selection, Setta leaves it cleared
- the simplest encoding is:
  - missing key: never chosen
  - string value: selected plugin id
  - `null`: explicitly none
- writing a selection does not require the plugin to be installed right now
- if the selected plugin is absent, disabled, or uninstalled, Python LSP is
  unavailable but the app keeps running
- if the selected plugin is absent, disabled, or uninstalled, Setta keeps the
  stored selection and shows a warning instead of silently clearing it
- the existing `basedpyright` warning-suppression defaults move into the
  first-party plugin's default config rather than remaining built into app
  settings
- language-server-specific settings live in the selected plugin's config, not
  in the main settings document
- the selected plugin's registration keeps a settings key rooted in plugin
  config, and the runtime passes only that selected plugin-owned settings
  branch to the language server
- for the first cut, writing a different selection does not need to rewire the
  live language server immediately; it may take effect after an explicit
  language-server restart or equivalent refresh if that is the simpler path,
  but the UI must say so clearly

Because no migration is needed, we can replace the current built-in
`basedpyright` assumptions directly rather than preserving old settings
branches.

### 4. Clear Unconfigured and Unavailable Behavior

When no Python language server is selected, or the selected plugin is missing
or disabled:

- app startup still succeeds
- diagnostics stay empty
- the app does not inject synthetic diagnostics such as "Python language server
  not configured"
- editor-triggered completions and signature help behave as unavailable and
  return no results
- restart-language-server actions return an explicit error
- the main project page shows a clear warning explaining why Python LSP is
  unavailable
- if a missing or disabled plugin was explicitly selected, the warning should
  say that the selected plugin is unavailable rather than pretending there was
  no selection

The exact warning placement can be finalized during UX verification, but it
must live in normal app UI on the main project page such as the header or
notifications area.

## Phase 1: Core Architecture Change

### A. Remove the built-in Python special case

Refactor the LSP router so Python is not created as a built-in base spec.

Needed changes:

- remove the current-process Python base-spec bootstrap from router creation
- allow the router to run with zero selected language servers for a language
- make Python LSP unconfigured unless a plugin is selected
- stop treating built-in `basedpyright` settings as a router-owned special case

### B. Allow plugins to target Python

Update plugin backend registration normalization to allow Python
language-server registrations.

Needed changes:

- remove the explicit plugin-side rejection of Python language servers
- change conflict handling from "same language is always ambiguous" to
  "multiple registrations may exist, but only the selected plugin becomes
  active for that language"

### C. Use plugin id as the selection identity

Plugin language-server registrations need a stable identity. For now, that
identity should be the plugin id rather than an extra registration-specific id.

Recommended fields:

- `pluginId`
- `language`
- `name`
- command/args/settings metadata

Selection should target the plugin id, not the human-readable name.

Validation should enforce the "one plugin package == one language-server
implementation" rule so we do not introduce hidden multi-implementation
ambiguity inside a single plugin package.

### D. Push only selected registrations into the router

Plugin discovery/runtime may know about many registrations, but the router
should only receive the active selection for each language.

This keeps:

- runtime behavior deterministic
- diagnostics/completion/signature routing simple
- same-language conflicts visible in configuration, not hidden in startup
  behavior

## Phase 2: First-Party `basedpyright` Plugin

Create a first-party plugin that owns the Python language server currently
hardcoded in the app.

For repo layout, place this implementation at
`plugins/setta-basedpyright/` as a normal plugin root with its own manifest,
package metadata, and backend entrypoint.

Responsibilities of the plugin:

- register the Python language server
- carry the `basedpyright` command/args plus a settings key rooted in plugin
  config
- own the carried-over warning-suppression defaults that currently live in
  built-in `basedpyright` app settings
- own any language-server-specific config schema
- keep those language-server-specific settings in plugin config and the Plugins
  UI/plugin-config flow rather than the main settings page
- own packaging/install metadata as a plugin artifact
- install `basedpyright` into the same Python environment that Setta itself is
  using for the relevant packaging flow

The app core should stop directly owning:

- the `basedpyright` command bootstrap
- `basedpyright` as a default packaged runtime dependency
- the assumption that Python LSP always exists

## Phase 3: Default Install Profile

Add a curated default installation/profile concept for first-run and dev flows.

The defaults profile should:

- be explicit and versioned
- install a known-good first-party plugin set
- include the first-party `basedpyright` plugin initially
- bootstrap the default Python selection on first workspace open when the
  workspace does not already have a `python` key under
  `languageServer.selectedByLanguage`
- never overwrite an explicit `null` or explicit plugin-id selection

For Python packaging flows, the simplest implementation is:

- `pip install "setta[defaults]"` installs Setta and the curated default plugin
  packages into the same Python environment
- the equivalent `uv` install flow does the same
- Setta discovers those plugins through the existing package-manager discovery
  path
- those default plugins are package-manager-managed rather than
  `setta plugins install` managed

We do not need a Setta-internal self-mutation path for the first cut.

Examples of the intended product behavior:

- `pip install setta[defaults]`
- the corresponding `uv tool` install-with-defaults flow
- a desktop-installer "install with default plugins" flow

Defaults installation should target the same Python environment that Setta is
using:

- `pip`: the same environment that provides the `setta` command
- `uv tool`: the same tool environment that runs `setta`
- desktop installer: the Setta-owned bundled runtime environment

A lockfile/profile-based approach is preferable because it gives:

- reproducibility
- exact versions
- an obvious integration-test target
- a future path for edition/profile variants

## Phase 4: Packaging Boundary Cleanup

Remove `basedpyright` from the app's direct packaged dependency boundary once
the plugin owns it.

Desired packaging result:

- core package contains only dependencies the core runtime directly needs
- the `basedpyright` dependency is installed by the plugin/defaults install
  step into the same Python environment that Setta itself uses
- packaged-distribution tests validate the new dependency boundary

The dev environment may still choose to install the default plugin profile, but
that must be separate from claiming the feature is built in.

## Testing Strategy

Testing needs to move from "the app always has this feature" to "the app plus a
chosen plugin set exposes this feature".

### 1. Core-Without-Plugin Tests

Add or update core tests so they run with no Python language-server plugin
installed.

These tests should verify:

- app startup succeeds without a Python language-server plugin
- app startup succeeds when no Python language server is selected
- diagnostics stay empty when Python LSP is unconfigured
- completion/signature flows behave as unavailable when Python LSP is
  unconfigured
- restart-language-server actions fail clearly and specifically when
  unconfigured
- non-LSP app behavior is unaffected
- settings/language-server-selection validation behaves correctly with no
  installed plugin or no selection

This is the most important testing change because it breaks the hidden
assumption that built-in functionality is always present.

### 2. Language-Server Plugin Contract Tests

Create a reusable contract suite for language-server plugins, starting with
Python.

Each Python language-server plugin should pass the same contract suite,
covering at least:

- install/link/discovery
- workspace selection
- diagnostics
- completions
- signature help
- restart/refresh semantics
- behavior when the selected plugin is disabled or uninstalled
- failure behavior when the language-server command is missing or invalid
- the chosen selection-change apply model for the first cut: either immediate
  apply or explicit restart/refresh, with the behavior made clear in product UI

The contract should be language-agnostic. `basedpyright` is just the first
implementation.

If a plugin supports multiple languages, the contract should still treat
selection as per-language rather than assuming that selecting the plugin once
activates every language it registers.

### 3. Plugin-Isolated Tests

Each plugin keeps its own focused test coverage.

For the `basedpyright` plugin, include:

- manifest and backend probe coverage
- packaging/install coverage
- registration shape
- plugin-specific settings handling
- carried-over `basedpyright` default warning suppressions
- minimal smoke coverage against the real command path when practical

These tests should not depend on the entire defaults profile.

### 4. Default-Profile Integration Tests

Add one narrow integration lane for the curated default plugin set.

This lane should verify:

- the default profile installs successfully
- the expected default plugins become active
- the first workspace open writes the default Python selection when the
  workspace has no `python` key under `languageServer.selectedByLanguage`
- basic Python LSP behavior works end to end
- if the user clears the Python selection, the defaults profile does not
  silently re-apply it

Keep this lane intentionally small. Its job is to validate the curated bundle,
not to replace isolated plugin tests.

### 5. Test Fixture and Helper Changes

Refactor test helpers so plugin presence is explicit.

Needed changes:

- helpers that previously assumed built-in language-server availability should
  either install/select a plugin or assert the unconfigured path
- plugin fixture scripts should support a default-profile setup path
- targeted test selection should continue to avoid unnecessary plugin fixture
  setup for unrelated runs

## Recommended Test Matrix

Small and explicit is better than broad and implicit.

### Core lane

- Go tests for router/language-server selection behavior
- Go tests for app startup with no Python plugin and with no Python selection
- Go/HTTP tests for empty diagnostics, unavailable completions/signature help,
  and explicit restart errors when no language server is selected
- Go/settings tests for missing-key vs `null` selection semantics

### Language-server plugin lane

- reusable language-server plugin contract tests
- run first against the first-party `basedpyright` plugin
- later reuse for other language-server plugins

### Defaults lane

- install/apply default plugin profile
- verify plugin activation and default workspace selection bootstrap
- run a short end-to-end Python LSP smoke
- verify that clearing the Python selection leaves Python LSP disabled

### Packaging lane

- verify `basedpyright` is no longer a direct core package dependency
- verify defaults/plugin installation places the dependency in the same Python
  environment that runs Setta

## Suggested Implementation Order

1. Refactor the LSP router to remove the built-in Python base spec.
2. Introduce explicit workspace selection for language servers and define the
   unconfigured behavior contract.
3. Allow plugin registrations to target Python and remove same-language
   ambiguity in favor of explicit selection.
4. Use plugin id as the language-server selection identity and enforce the
   "one plugin package == one language-server implementation" rule.
5. Update plugin runtime refresh so it sends only selected registrations to the
   router.
6. Convert current Python LSP tests so they explicitly install/select a plugin
   or assert the unconfigured path.
7. Build the first-party `basedpyright` plugin, including the carried-over
   default warning suppressions.
8. Remove `basedpyright` from the core packaged dependency boundary.
9. Add the curated default plugin profile, install-with-defaults flows, and
   narrow integration tests.

## Acceptance Criteria

- The app can start and function normally with no Python language-server plugin
  installed.
- The app can start and function normally with no Python language server
  selected.
- If defaults are installed and the workspace has no `python` key under
  `languageServer.selectedByLanguage`, the first workspace open writes the
  default Python selection and Python completion works immediately.
- If the user clears the Python selection, Python LSP remains disabled until
  the user explicitly selects a plugin again.
- A first-party `basedpyright` plugin can provide Python LSP end to end.
- Multiple same-language plugins may coexist without ambiguity because the
  active plugin is explicitly selected in workspace settings.
- If the selected plugin is absent or disabled, the app keeps running, Python
  diagnostics stay empty, restart returns an explicit error, the stored
  selection remains intact, and the main project page shows a clear warning.
- If changing `languageServer.selectedByLanguage` requires an explicit
  language-server restart or equivalent refresh in the first cut, that required
  action is clear in the UI and covered by tests.
- The default install profile can install and activate the chosen default
  Python plugin.
- A multi-language language-server plugin may exist, but users still select it
  separately per language.
- Language-server-specific settings remain plugin-owned and editable through
  the existing Plugins UI/config flow; the main settings page only owns
  per-language selection.
- Tests are clearly split between core-without-plugin, per-plugin contract, and
  default-profile integration coverage.
- The core packaged dependency boundary no longer directly includes
  `basedpyright`.

## Risks Worth Watching

- Some current tests likely depend on implicit Python LSP availability in ways
  that are not obvious yet.
- Signature-help and watch-code paths may be the most tightly coupled to the
  current built-in `basedpyright` assumptions.
- The one-time default-selection bootstrap must be implemented carefully so it
  helps first-run UX without silently undoing a user's explicit "no LSP"
  choice.
- Installing plugin-owned Python dependencies into the same environment as
  Setta may have packaging-specific edge cases across `pip`, `uv tool`, and the
  desktop installer.
- If language-server selection is not explicit enough, the system will drift
  back toward ambiguity and hidden defaults.
- If the defaults lane grows too large, it will become a slow and fragile proxy
  for isolated plugin coverage.

## Final Recommendation

Treat this as a clean architectural cut, not a migration exercise.

The right first step is not "wrap built-in basedpyright in a plugin-shaped
shell". The right first step is:

- remove built-in Python language-server ownership from the core
- introduce explicit language-server selection
- then move `basedpyright` into a first-party plugin on that new path

That yields a cleaner plugin system now and avoids carrying a fake
compatibility layer for a user base that does not exist.
