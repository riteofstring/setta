# String Args Without Quotes Option

## Goal
Add section config setting allowing string-typed function args to be entered without wrapping quotes.

## Scope
- In scope: parser behavior toggled by config, string-type detection, serialization correctness.
- Out of scope: changing non-string argument parsing rules.

## Plan
1. Add config flag for unquoted string input behavior.
2. Update argument parsing logic to respect type metadata and this setting.
3. Ensure display/export still serializes strings correctly.
4. Add clear UI hint to avoid ambiguity when setting is enabled.

## Acceptance Criteria
- When enabled, string-typed args can be entered without quotes.
- Non-string typed args keep existing behavior.

## Verification
- Add parser unit tests for enabled/disabled modes.
- Add Playwright coverage for argument input/edit flows.
- Validate no regressions in generated payloads.

## Delivery Notes (2026-02-14)
- Added section-level config toggle in `frontend/src/components/Panes/UiEditor/SectionConfig/EdgePortsSettings.tsx` that calls `route_set_section_allow_unquoted_string_args`.
- Added string-annotation hinting in `frontend/src/components/Params/ParamUIs/ParamUI.tsx` using `frontend/src/utils/typeAnnotation.ts`.
- Added/updated tests: `frontend/src/components/Params/ParamUIs/ParamUI.test.tsx`, `frontend/src/utils/typeAnnotation.test.ts`, `frontend/src/components/Panes/UiEditor/SectionConfig/SectionDataAuthoringSettings.test.tsx`, and backend coverage in `tests/code_gen/test_code_obj_value_policy_dependency_graph.py`, `tests/project_state/test_signature_help_type_annotations.py`, and `tests/types/test_helpers_lvl2.py`.
