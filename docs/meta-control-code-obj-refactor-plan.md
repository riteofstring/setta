# Meta Control + Code Obj Unification Plan

## Goal
Unify meta controls and code obj parameter controls so they share the same
type system, value storage, UI config, and formatting logic. Remove the
parallel MetaControlType stack and use code obj types as the single source of
truth. Backward compatibility is explicitly out of scope.

## Summary of the Target Shape
- Meta control sections store a single code obj ID + variant mapping instead of
  `metaControlType` / `metaControlValue`.
- Value-bearing meta controls use `CodeObjType` (extended with missing value
  kinds), but meta controls only accept the **param-like subset** (no
  `CodeCallable` or `NestedParam`).
- Action-only controls (ex: button) stay separate via an `ActionControlType`
  enum and are not part of `CodeObjType`.
- Value formatting and realtime handling reuse the existing param pipeline.
- Meta control UI renders using shared control components + code obj config.

## Proposed Model Changes
- **Types**
  - Remove `MetaControlType` from `backend/setta/types/section_impls.py`.
  - Introduce `ActionControlType` (ex: `button`) for action-only controls.
  - Extend `CodeObjType` in `backend/setta/types/code_obj_impls.py` with missing
    value-control kinds: `RotaryParam`, `DropzoneParam`, `TextAreaParam`
    (or similar names, aligned with UI intent). Do **not** add button.
  - Define a restricted control set (`ControlCodeObjType` or
    `ControlCodeObjTypeSet`) that excludes `CodeCallable` and `NestedParam`.
    Validate this at creation time and when loading meta control sections.
  - Add corresponding `*CodeObjImpl` classes with defaults/config as needed.
  - Update `MetaControlSectionImpl` to hold:
    - `controlParamId: ID | None`
    - `controlCodeObjVariantMap: dict[ID, ID]` (or reuse `codeObjVariantMap`)
    - `actionControlType: ActionControlType | None`
    - validation: exactly one of `controlParamId` or `actionControlType` is set
  - Remove `metaControlType` and `metaControlValue` fields entirely.
- **Settings / defaults**
  - Update settings defaults so new MetaControl sections create a control code
    obj + variant automatically.
  - Ensure `create_section_impl` / `create_top_level_section` attaches the
    default control param for new MetaControl sections.

## Backend Changes
- **Helpers**
  - Add helpers like `get_meta_control_param_id` and
    `get_curr_meta_control_impl_with_type_guard` to avoid `.get` access.
  - Replace `set_meta_control_value` to delegate to
    `set_param_entered_value` on the control param.
- **Dependency graph + codegen**
  - `DependencyGraph._export_meta_control_section` should load the control
    code obj impl + value and store the code obj type on the node.
  - `PythonValueCodec._format_meta_control_section` should reuse the same
    formatting logic as `format_param_expression` (now based on `CodeObjType`).
  - Eliminate `meta_control_type` fields in `SectionNode` once formatting is
    driven by code obj type.
- **Listener / realtime**
  - Replace `MetaControlActionEvent` with `ControlActionEvent`.
  - Use `ActionControlType` in the action payload.
  - For value controls, emit `SectionParamDependencyKey` updates.
  - For action-only controls, keep action events (no persistence required).

## Frontend Changes
- **State + actions**
  - Remove `route_set_meta_control_value` usage. Use
    `route_set_param_entered_value` and the control param ID.
  - Replace `sendRealtimeMetaControlLiteral` with
    `sendRealtimeSectionParamLiteral` for non-action controls.
  - Keep a `sendRealtimeControlAction` for action-only controls (payload uses
    `ActionControlType`).
- **UI**
  - Render MetaControl sections using a shared control renderer that accepts:
    - `CodeObjType`
    - value string
    - optional UI config (slider min/max/step, dropdown choices, colors)
  - Use existing input components (`SliderInput`, `DropdownInput`, etc.) and
    `useParamCodeObjUIConfig` for configs.
  - Update `createSectionsHelper` to choose the desired control type by
    selecting a code obj type instead of `metaControlType`.

## Generated Types + Build Steps
- Update generation scripts (`frontend/generation/*`) to reflect new code obj
  impls and the updated `MetaControlSectionImpl`.
- Regenerate types:
  - `source activate.sh && cd frontend && pnpm generate`
- Do **not** manually edit `backend/setta/types/generated/*`.

## Tests / Validation
- Add/update backend tests:
  - `DependencyGraph` meta control export uses code obj value.
  - `PythonValueCodec` renders meta controls via code obj type.
  - Listener dependency updates accept meta control param updates.
- Smoke-check UI:
  - Create each control type and verify realtime + persistence paths.

## Suggested Execution Order
1. Update backend types + settings defaults; add new code obj types.
2. Update helpers + dependency graph + value codec.
3. Update listener event types + websocket handlers.
4. Update frontend rendering + actions.
5. Run `pnpm generate` and fix type fallout.
6. Update tests and docs (`docs/listener-flows.md`).
