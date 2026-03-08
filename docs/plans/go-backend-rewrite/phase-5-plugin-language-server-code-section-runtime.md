# Phase 5 Plugin Language-Server Code-Section Runtime

## Purpose

This doc scopes the first caller-backed multi-language LSP follow-up after the
completed Go Python LSP runtime and the completed plugin backend-registration
visibility work.

Go already owns:

- plugin backend registration discovery for language servers
- project-scoped LSP diagnostics storage and websocket hydration
- Python code-section and generated-code LSP synchronization
- snapshot-backed completion transport

What Go does not yet own is the path from a plugin language-server
registration to real diagnostics and `codeAreaCompletion` for plugin-defined
`Code` sections.

The active frontend caller is:

- `frontend/tests/e2e/overview/plugins/plugin-language-server.spec.ts`

That caller requires all of the following to work in Go:

- a top-level `Code` section can be created with plugin-defined
  `codeLanguage`
- the section gets a deterministic canonical file binding
- the active LSP runtime routes that section to the matching registered
  language server
- `POST /codeAreaCompletion` returns completions for that section
- diagnostics for that section broadcast and hydrate through the existing Go
  diagnostics store

## Status

Current repo status as of 2026-03-09:

- Go project-state creation still rejects plugin-defined `codeLanguage`
  values in `createTopLevelSection`
- Go project normalization only reconciles canonical bindings for Python code
  sections
- Go LSP runtime wiring in `internal/app/app.go` still constructs a single
  current-process Python session
- Go `internal/lspcompletion` snapshot builders still special-case Python for
  all completion entry points
- the lower-level Go LSP session boundary is already generic enough to speak
  to non-Python servers
- plugin runtime/status already expose registered language-server metadata,
  including `language`, `command`, `args`, and `settingsKey`
- Python reference code already uses deterministic canonical bindings for
  non-generated code sections across arbitrary languages via
  `get_code_language_extension(...)`

## Scope

This focused Phase 5 follow-up covers:

- deterministic canonical code-file binding reconciliation for active
  non-generated code sections across arbitrary `codeLanguage` values
- top-level Code-section creation that accepts plugin-defined languages
- a Go-owned language-to-session LSP runtime above the existing generic
  session/process boundary
- code-section diagnostics synchronization for plugin-registered languages
- `codeAreaCompletion` for plugin-defined code sections

## Non-Goals

- text-field, output-accessor, gen-code prefix, or gen-code suffix completion
  for non-Python languages
- watch-code or bound-code runtime support for non-Python languages
- plugin-defined run-command ownership
- format-code support for non-Python languages
- deployment/share-mode multi-language LSP enablement
- heuristic language guessing from filenames or payload text

## Inputs

- `docs/plans/go-backend-rewrite/phase-5-lsp-diagnostics-and-completion-runtime.md`
- `docs/plans/go-backend-rewrite/spike-lsp.md`
- `backend/setta/lsp/managers.py`
- `backend/setta/project_state/base_project_manager.py`
- `backend/setta/project_state/project_code.py`
- `backend/setta/types/project_state.py`
- `tests/lsp/test_fixture_language_server_integration.py`
- `tests/project_state/test_code_section_diagnostics.py`
- `frontend/tests/e2e/overview/plugins/plugin-language-server.spec.ts`
- `internal/lsp/session.go`
- `internal/lsp/project_synchronizer.go`
- `internal/lspcompletion/python_snapshot_builders.go`
- `internal/plugins/backend_registrations.go`
- `internal/projectstate/python_code_section_bindings.go`
- `internal/projectstate/top_level_section_creation.go`

## Dependency Findings

The active gap is not just an extra transport handler.

Three source-of-truth layers are missing in Go:

1. active project-state support for non-Python `Code` languages
2. deterministic canonical file bindings for those sections
3. language-aware LSP session routing above `internal/lsp.Session`

The Python reference implementation establishes one important contract that Go
should mirror instead of inventing a new one:

- canonical code-section bindings are derived from the active section path slug
  plus an extension derived from `codeLanguage`
- slug conflicts leave sections unbound instead of racing for a path
- the extension fallback is deterministic and based on the normalized language
  key, not heuristics

## Working Decisions

- keep the existing Go LSP session boundary
  - add multi-language routing above `internal/lsp.Session`
  - do not replace it with framework-style runtime magic
- keep Python as a built-in registration
  - plugin registrations must not override Python
- derive code-section bindings from project state
  - use the active section path slug plus the language-derived extension
  - keep explicit bindings authoritative when already present
- keep `codeAreaCompletion` the only non-Python completion slice in scope
  - it is the real caller-backed requirement today
- resolve language-server settings from saved settings documents when a session
  is created
  - do not add heuristic or duplicated config channels
- keep diagnostics storage shared
  - plugin-language diagnostics must flow through the existing
    `projectstate.LSPDiagnosticsRegistry`

## Recommended Option

Implement this in two bounded slices.

### Slice 1

- generalize project-state code-language acceptance and canonical bindings
- add a language-aware LSP service that owns:
  - built-in Python registration
  - plugin language-server registrations
  - per-language session lookup
- teach project synchronization and `codeAreaCompletion` to route by section
  language

This slice is sufficient for the existing plugin language-server frontend
caller.

### Slice 2

- consider non-Python watch-code/bound-code/runtime ownership only if a caller
  appears
- consider non-Python text-field/output/gen-code completion only if a caller
  appears

## Proposed Go Boundaries

### `internal/projectstate`

Own:

- validation and normalization of arbitrary code-language bindings
- canonical binding reconciliation for active code sections
- active code-section file enumeration with language metadata

Do not own:

- process/session lifecycle
- settings lookup

### `internal/lsp`

Own:

- session lifecycle per language server
- routing a canonical or snapshot document to the correct language session
- diagnostics callback registration per synced document

Do not own:

- project mutation rules
- HTTP decoding

### `internal/lspcompletion`

Own:

- section-language-aware `codeAreaCompletion`
- continued Python-specialized handling for the existing generated-code and
  callable-related completion routes

Do not own:

- diagnostics storage
- language-server discovery

### `internal/app`

Own:

- wiring settings-state access, plugin registration loading, and the
  multi-language LSP runtime together
- keeping the IDE-only LSP lifecycle explicit

## Exit Criteria

This doc is complete when all of the following are true:

- `createTopLevelSection` accepts plugin-defined `codeLanguage` values
- normalized project state assigns deterministic canonical bindings for those
  sections
- the app can start and use a registered plugin language server for that
  language
- `POST /codeAreaCompletion` returns real completions for the plugin-defined
  section
- diagnostics for that section appear in the existing Go diagnostics payload
- the focused app/route/runtime tests and the Playwright plugin
  language-server spec pass
