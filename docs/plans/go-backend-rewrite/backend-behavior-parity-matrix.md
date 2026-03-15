# Backend Behavior Parity Matrix

Last updated: `2026-03-15`

Source baseline branch: `main`

Source baseline commit for this audit slice:
`26e7406b764009690b3b5af7ade260c91407c0be`

Target rewrite head:
`9aae6c25c91c521ef616e10f82dd52cf63310b24`

This is the first executed slice of the matrix plan, not the finished matrix.
It covers:

- project names
- view mode names
- window-space names
- section names
- param / code-object names
- generated/default naming in this cluster
- related rename/create route contracts
- related name-validation websocket behavior

Rows outside this slice are still pending.

## Status Meanings

- `Proved`
  - the surviving behavior is backed by cited Go implementation and cited Go
    proof.
- `Implemented, proof incomplete`
  - Go code appears to implement the behavior, but the current proof does not
    yet match the source-baseline evidence closely enough.
- `Missing`
  - the source-baseline behavior does not currently have an equivalent Go
    behavior.

## Current Read

- The first audited slice already shows why the broader rewrite checklists were
  not enough.
- Most lifecycle, route, and websocket behaviors in this slice are now proved.
- Several format-rule clusters are implemented in Go but still under-proved
  relative to `main`.
- One concrete parity gap is already visible:
  - source-baseline `add_kwarg` creates unnamed editable params
  - current Go `AddKwarg` assigns a non-empty generated name instead

## Project Names

| ID | Behavior | Source-baseline evidence (`main`) | Go implementation / proof | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| `PN-01` | Project rename trims whitespace before storage. | `tests/utils/test_name_validation.py::test_project_name_trims_whitespace`; `docs/reference/name-validation.md` normalization section. | Impl: `internal/projectstate/project_names.go`; proof: `internal/projectstate/project_names_test.go::TestDocumentSetProjectNameTrimsWhitespaceAndUpdatesProject`. | `Proved` | |
| `PN-02` | Project names reject reserved names `home` and `Settings`. | `tests/utils/test_name_validation.py::test_reserved_project_name_rejected`; `tests/utils/test_name_validation.py::test_settings_project_name_rejected`; `docs/reference/name-validation.md`. | Impl: `internal/projectstate/project_names.go`; proof: `internal/projectstate/project_names_test.go::TestDocumentSetProjectNameRejectsReservedName`; transport proof: `internal/httpapi/project_shell_routes_test.go::TestRegisterProjectShellRoutesRejectsInvalidProjectRenameWithDetail`. | `Implemented, proof incomplete` | Go proof explicitly covers `home`; this slice has no direct Go test yet for the Settings-project reserved-name case. |
| `PN-03` | Project names enforce the documented format rules: non-empty after trim, no path separators, no `..`, no control chars, only `[A-Za-z0-9 _-]`, and non-empty slug after sanitization. | `tests/utils/test_name_validation.py` project-name tests for path separators, `..`, leading dot, `@`, empty-after-trim, invalid-after-sanitization; `docs/reference/name-validation.md`. | Impl: `internal/projectstate/project_names.go::projectNameFormatError`; partial proof: `internal/projectstate/name_validation_test.go::TestCollectNameValidationErrorsReportsProjectAndSectionIssues`. | `Implemented, proof incomplete` | Go code matches the rule set, but current Go tests only directly exercise a subset of the project-name format failures in this slice. |
| `PN-04` | Project names reject slug collisions, including case-insensitive collisions. | `tests/utils/test_name_validation.py::test_project_slug_collision_rejected`; `tests/utils/test_name_validation.py::test_project_slug_collision_case_insensitive_rejected`; `docs/reference/name-validation.md`. | Impl: `internal/projectstate/project_names.go::validateProjectName`; proof: `internal/projectstate/project_names_test.go::TestDocumentSetProjectNameRejectsSlugCollision`. | `Implemented, proof incomplete` | The main slug-collision behavior is proved; this slice does not yet have a direct Go test for the case-insensitive collision variant. |
| `PN-05` | Format-only collection for name-validation broadcasts allows an already-reserved Settings project name to persist without a false-positive project error. | `tests/utils/test_name_validation.py::test_collect_project_name_format_errors_allows_settings_name`; `docs/reference/name-validation.md` project-state updates section. | Impl: `internal/projectstate/name_validation.go::collectProjectNameFormatErrors`. | `Implemented, proof incomplete` | Current Go code has the same `allowReserved` branch, but this slice has no direct Go test yet. |
| `PN-06` | Creating a project yields a valid unique project name, creates a single initial view mode, and reconciles the default-project pointer. | Source implementation: `backend/setta/types/project_config.py` (`ProjectConfig.name` default factory) plus `backend/setta/project_state/base_project_manager.py::create_project_config`; `docs/reference/name-validation.md` project-name section. | Impl: `internal/projectstate/project_lifecycle.go::CreateProject`; proof: `internal/projectstate/project_lifecycle_test.go::TestDocumentCreateProjectInitializesSingleViewModeAndDefault`; `internal/projectstate/project_lifecycle_test.go::TestNextAvailableProjectNameRetriesGeneratedNamesUntilOneIsValid`. | `Proved` | This row covers the generated default name and the initial project-lifecycle invariants together. |
| `PN-07` | Invalid project rename transport returns `422` and includes the validation detail. | Source docs: `docs/reference/name-validation.md` errors/API section; source route family: `backend/setta/routers/projects.py`. | Proof: `internal/httpapi/project_shell_routes_test.go::TestRegisterProjectShellRoutesRejectsInvalidProjectRenameWithDetail`. | `Proved` | Current caller-facing proof exists at the Go HTTP layer. |

## View Mode Names

| ID | Behavior | Source-baseline evidence (`main`) | Go implementation / proof | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| `VN-01` | View mode names reject reserved names and the documented format failures: path separators, `..`, invalid characters, and invalid-after-sanitization results. | `tests/utils/test_name_validation.py` view-mode tests at lines covering `home`, `bad/name`, `bad..name`, `bad@name`, and `__`; `docs/reference/name-validation.md`. | Impl: `internal/projectstate/view_modes.go::validateViewModeName`. | `Implemented, proof incomplete` | Current Go code matches the source rule set, but this slice has no direct Go tests yet for most individual invalid-name variants. |
| `VN-02` | View mode rename trims whitespace and rejects slug collisions, including case-insensitive collisions. | `tests/utils/test_name_validation.py::test_view_mode_name_trims_whitespace`; `tests/utils/test_name_validation.py::test_view_mode_slug_collision_rejected`; `tests/utils/test_name_validation.py::test_view_mode_slug_collision_case_insensitive_rejected`; `docs/reference/name-validation.md`. | Impl: `internal/projectstate/view_modes.go::validateViewModeName`; proof: `internal/projectstate/view_modes_test.go::TestRuntimeViewModeNameValidationAndSortOrderErrors`. | `Proved` | The Go test proves trimming and a case-insensitive collision (`Details` vs `details`). |
| `VN-03` | Creating a view mode generates a valid unique default name, clones the current layout/viewport, and enables editing mode. | Source implementation: `backend/setta/types/project_config.py::ViewModeConfig.name` default factory and `backend/setta/project_state/base_project_manager.py::create_view_mode`. | Impl: `internal/projectstate/view_modes.go::CreateViewMode`; proof: `internal/projectstate/view_modes_test.go::TestRuntimeCreateAndSwitchViewModesSwapLayoutAndViewportState`. | `Proved` | |
| `VN-04` | Invalid view-mode rename transport returns `422` with `invalid_view_mode_name`. | Source docs: `docs/reference/name-validation.md` errors/API section; source route family: `backend/setta/routers/project_manager.py`. | Proof: `internal/httpapi/project_routes_test.go::TestRegisterProjectRoutesSetViewModeNameReturns422ForInvalidName`. | `Proved` | |

## Window-Space Names

| ID | Behavior | Source-baseline evidence (`main`) | Go implementation / proof | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| `WN-01` | Window-space names enforce the documented format rules, and `home` is allowed because the namespace is explicit. | `tests/utils/test_name_validation.py` window-space tests for path separators, `..`, invalid characters, invalid-after-sanitization, trim, and explicit `home` allowance; `docs/reference/name-validation.md`. | Impl: `internal/projectstate/project_chat_windowing_writes.go::validateWindowSpaceName`. | `Implemented, proof incomplete` | Current Go code matches the source rule set, but this slice has no direct Go proof yet for the `home` allowance or most individual invalid-name variants. |
| `WN-02` | Window-space create trims the submitted name and normalizes persisted state. | `tests/utils/test_name_validation.py::test_window_space_name_trims_whitespace`; `docs/reference/name-validation.md` normalization section. | Impl: `internal/projectstate/project_chat_windowing_writes.go::CreateWindowSpace`; proof: `internal/projectstate/project_chat_windowing_writes_test.go::TestRuntimeCreateWindowSpacePersistsNormalizedState`. | `Proved` | This row proves create-time normalization; rename-time trimming still lacks its own direct Go proof in this slice. |
| `WN-03` | Window-space rename rejects slug collisions, including case-insensitive collisions. | `tests/utils/test_name_validation.py::test_window_space_slug_collision_rejected`; `tests/utils/test_name_validation.py::test_window_space_slug_collision_case_insensitive_rejected`. | Impl: `internal/projectstate/project_chat_windowing_writes.go::validateWindowSpaceName`; proof: `internal/projectstate/project_chat_windowing_writes_test.go::TestRuntimeWindowSpaceNameSortAndDeleteMutations`. | `Proved` | The Go test proves a case-insensitive trimmed collision (`Primary` vs ` primary `). |
| `WN-04` | Creating a window space without an explicit name generates a valid unique default name. | Source implementation: `backend/setta/types/project_config.py::WindowSpaceConfig.name` default factory and `backend/setta/project_state/base_project_manager.py::create_window_space`. | Impl: `internal/projectstate/project_chat_windowing_writes.go::CreateWindowSpace`; proof: `internal/projectstate/project_chat_windowing_writes_test.go::TestRuntimeCreateWindowSpaceGeneratesValidDefaultName`. | `Proved` | |
| `WN-05` | Invalid window-space name transport mapping is part of the supported rename surface. | Source docs: `docs/reference/name-validation.md` errors/API section; source route family: `backend/setta/routers/project_manager.py`. | Impl: `internal/httpapi/project_routes.go::setWindowSpaceNameHandler`. | `Implemented, proof incomplete` | This slice does not yet have a direct Go route test proving the invalid-name mapping for `RouteSetWindowSpaceName`. |

## Section Names

| ID | Behavior | Source-baseline evidence (`main`) | Go implementation / proof | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| `SN-01` | Section rename trims whitespace before storage. | `tests/utils/test_name_validation.py::test_section_name_trims_whitespace`; `docs/reference/name-validation.md` normalization section. | Impl: `internal/projectstate/section_names.go`; proof: `internal/projectstate/section_names_test.go::TestProjectSetSectionNameTrimsAndUpdatesSection`. | `Proved` | |
| `SN-02` | Section names enforce the documented format rules: non-empty after trim, no path separators, no `..`, no control chars, only `[A-Za-z0-9 _-]`, and no reserved names. | `tests/utils/test_name_validation.py` section-name tests for `bad..name`, empty-after-trim, leading dot, `bad#name`, simple-char acceptance, and `Chat_` allowance; `docs/reference/name-validation.md`. | Impl: `internal/projectstate/section_names.go`; proof: `internal/projectstate/section_names_test.go::TestProjectSetSectionNameRejectsInvalidFormat`; partial proof: `internal/projectstate/name_validation_test.go::TestCollectNameValidationErrorsReportsProjectAndSectionIssues`. | `Implemented, proof incomplete` | Path-separator rejection is proved. The rest of the main format-rule cluster still needs direct Go proof. |
| `SN-03` | Section rename rejects duplicate sibling names under the same parent. | `tests/utils/test_name_validation.py::test_duplicate_sibling_name_rejected`; `docs/reference/name-validation.md`. | Impl: `internal/projectstate/section_names.go`; proof: `internal/projectstate/section_names_test.go::TestProjectSetSectionNameRejectsDuplicateSiblingName`. | `Proved` | |
| `SN-04` | Section rename rejects top-level Python-identifier conflicts and descendant/full-path slug conflicts. | `tests/utils/test_name_validation.py::test_top_level_python_identifier_conflict_rejected`; `tests/utils/test_name_validation.py::test_section_slug_collision_rejected`; `tests/utils/test_name_validation.py::test_section_slug_collision_case_insensitive_rejected`; `docs/reference/name-validation.md`. | Impl: `internal/projectstate/section_names.go`; proof: `internal/projectstate/section_names_test.go::TestProjectSetSectionNameRejectsTopLevelIdentifierConflict`; `internal/projectstate/section_names_test.go::TestProjectSetSectionNameRejectsDescendantSlugConflict`. | `Proved` | This slice proves the identifier-conflict and descendant path-slug branches directly. |
| `SN-05` | Text-block headings reused as section names run through the same validator and report heading-specific errors. | `tests/utils/test_name_validation.py` heading-name error tests; `docs/reference/name-validation.md` text-block heading section. | Impl: `internal/projectstate/name_validation.go::collectTextBlockHeadingNameErrors`; proof: `internal/projectstate/name_validation_test.go::TestCollectNameValidationErrorsReportsTextBlockHeadingNameErrors`. | `Proved` | |
| `SN-06` | Creating a top-level section generates a valid default name, and invalid initial names do not leave partial state behind. | Source implementation: `backend/setta/types/helpers_lvl2.py::create_top_level_section` plus `Core` default naming; source validation tests in `tests/utils/test_name_validation.py`. | Impl: `internal/projectstate/top_level_section_creation.go`; proof: `internal/projectstate/top_level_section_creation_test.go::TestProjectCreateTopLevelSectionPrunesStaleLayoutStateAndUsesDeterministicPlacement`; `internal/projectstate/top_level_section_creation_test.go::TestProjectCreateTopLevelSectionDoesNotPersistPartialStateWhenInitialNameValidationFails`. | `Proved` | |
| `SN-07` | Invalid section rename transport returns `422` with `invalid_section_name`. | Source docs: `docs/reference/name-validation.md` errors/API section; source route family: `backend/setta/routers/project_manager.py`. | Proof: `internal/httpapi/project_routes_test.go::TestRegisterProjectRoutesSetSectionNameReturns422ForInvalidName`. | `Proved` | |

## Param / Code-Object Names

| ID | Behavior | Source-baseline evidence (`main`) | Go implementation / proof | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| `CN-01` | Non-dict param renames require a valid Python identifier when Python codegen is enabled. | `tests/utils/test_name_validation.py::test_param_name_requires_python_identifier`; `docs/reference/name-validation.md`. | Impl: `internal/projectstate/code_object_names.go::validateCodeObjectNameFormat`; proof: `internal/projectstate/code_object_names_test.go::TestProjectSetCodeObjectNameRejectsInvalidCallableParamFormat`; `internal/projectstate/name_validation_test.go::TestCollectNameValidationErrorsReportsParamFormatAndConflicts`. | `Proved` | |
| `CN-02` | Param renames reject duplicate sibling names under the active parent hierarchy. | `tests/utils/test_name_validation.py` duplicate-param checks; `docs/reference/name-validation.md`. | Impl: `internal/projectstate/code_object_names.go::validateCodeObjectNameForSection`; proof: `internal/projectstate/code_object_names_test.go::TestProjectSetCodeObjectNameRejectsDuplicateSiblingName`; `internal/projectstate/name_validation_test.go::TestCollectNameValidationErrorsReportsParamFormatAndConflicts`. | `Proved` | |
| `CN-03` | Meta-control param renames stay format-only instead of inheriting duplicate hierarchy checks. | Source implementation: `backend/setta/utils/name_validation.py` meta-control branch; source tests around meta-control handling in `tests/utils/test_name_validation.py`. | Impl: `internal/projectstate/code_object_names.go::validateCodeObjectNameForSection`; proof: `internal/projectstate/code_object_names_test.go::TestProjectSetCodeObjectNameAllowsMetaControlFormatRename`. | `Proved` | |
| `CN-04` | Editable kwargs and dict roots may keep empty names during rename-time validation. | `tests/utils/test_name_validation.py::test_param_name_allows_empty_for_editable_kwarg`; `tests/utils/test_name_validation.py::test_param_name_allows_empty_for_dict_root`; `docs/reference/name-validation.md`. | Impl: `internal/projectstate/code_object_names.go::validateCodeObjectNameFormat`. | `Implemented, proof incomplete` | Current Go code has the same empty-name allowances, but this slice has no direct Go test yet. |
| `CN-05` | `setParamNameAndValue` is atomic: invalid names or unsupported value writes do not partially apply. | Source implementation: `backend/setta/project_state/base_project_manager.py::set_param_name_and_value`; source docs: `docs/reference/name-validation.md` immediate-validation section. | Impl/proof: `internal/projectstate/code_object_name_and_value_test.go::TestProjectSetParamNameAndValueDoesNotPartiallyApplyOnInvalidName`; `internal/projectstate/code_object_name_and_value_test.go::TestProjectSetParamNameAndValueDoesNotPartiallyApplyOnUnsupportedValueMutation`. | `Proved` | |
| `CN-06` | Invalid code-object rename transport returns `422` with `invalid_code_obj_name`. | Source route family: `backend/setta/routers/project_manager.py`; source docs: `docs/reference/name-validation.md`. | Proof: `internal/httpapi/project_routes_test.go::TestRegisterProjectRoutesCodeObjectNameAndDisplayNameMutationsRejectInvalidInputs`. | `Proved` | |
| `CN-07` | `add_kwarg` creates an unnamed editable kwarg by default. | Source implementation: `backend/setta/types/helpers_lvl2.py::create_kwarg_objs` sets `Core(name="")`; source validation tests also explicitly allow empty editable-kwarg names. | Current Go behavior: `internal/projectstate/add_kwarg.go::nextAvailableAddKwargName` plus `newAddKwargCodeObject`; proof of divergence: `internal/projectstate/add_kwarg_test.go` now asserts the created name is non-empty and valid. | `Missing` | This is the first concrete behavior gap found in the matrix. Current Go assigns a generated non-empty name instead of preserving the source-baseline unnamed default. This needs an explicit product decision: restore source behavior or document an intentional divergence. |

## Generated Names And Broadcast Contracts

| ID | Behavior | Source-baseline evidence (`main`) | Go implementation / proof | Status | Notes |
| --- | --- | --- | --- | --- | --- |
| `GB-01` | Creating a meta-control section yields a valid default control param name. | Source implementation: `backend/setta/types/helpers_lvl2.py::add_meta_control_code_obj` uses `Core()` default naming. | Proof: `internal/projectstate/top_level_section_creation_test.go::TestProjectCreateTopLevelSectionCreatesMetaControlParamAndHonorsExplicitPosition`. | `Proved` | |
| `GB-02` | Aggregated name-validation payloads include project, section, param, and text-block-heading errors. | Source implementation: `backend/setta/project_state/base_project_manager.py::_broadcast_name_validation_errors`; source docs: `docs/reference/name-validation.md` project-state updates section. | Impl: `internal/projectstate/name_validation.go::CollectNameValidationErrors`; proof: `internal/projectstate/name_validation_test.go` aggregate tests. | `Proved` | |
| `GB-03` | Frontend websocket connections receive the current name-validation payload on initial connect. | Source docs: `docs/reference/name-validation.md` backend-sent name validation errors; source websocket broadcaster: `backend/setta/project_state/base_project_manager.py::_broadcast_name_validation_errors`. | Proof: `internal/app/websocket_test.go::TestAppFrontendWebsocketSendsInitialNameValidationErrors`. | `Proved` | |
| `GB-04` | Saving project state rebroadcasts the current name-validation payload. | Source websocket behavior in `backend/setta/project_state/base_project_manager.py`; source docs: `docs/reference/name-validation.md`. | Proof: `internal/app/websocket_test.go::TestAppSaveBroadcastsNameValidationErrors`. | `Proved` | |
| `GB-05` | View-mode names are validated on rename but are not included in the websocket name-validation payload. | `docs/reference/name-validation.md` project-state updates section. | Current payload shape: `internal/projectstate/name_validation.go::NameValidationErrors`; websocket proofs: `internal/app/websocket_test.go` initial/save payload coverage. | `Implemented, proof incomplete` | Current Go payload shape matches the source doc, but this slice has no direct Go test asserting the absence of view-mode validation errors from the broadcast content. |

## First-Slice Findings

1. The first audited slice already contains one concrete source-parity gap:
   `CN-07`.
2. The remaining issues in this slice are mostly proof gaps, not immediately
   obvious implementation gaps.
3. The next high-value step is narrow:
   - close proof gaps for project/view-mode/window-space/section format-rule
     variants
   - decide whether `CN-07` is a bug to fix or an intentional behavior change
     that must be documented
