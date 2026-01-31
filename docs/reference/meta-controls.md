# Meta Controls

This page describes how MetaControl sections are represented in project state, how
their values and action events propagate, and how they appear in generated code and listeners.

## What a MetaControl section is
- `SectionType.MetaControl` wraps a single control code object stored as
  `metaControlParamId` on the section impl.
- The control type must be one of the backend control types
  (`CodeParam`, `TextParam`, `ButtonParam`, `SliderParam`, `SwitchParam`,
  `ColorPickerParam`, `DropdownParam`, `PasswordParam`, `DropzoneParam`).
- Meta controls are not "sections with params"; there is no way to add extra
  controls. Create another MetaControl section instead.

## Creation + configuration
- `create_top_level_section` with `implType=MetaControl` accepts
  `controlCodeObjType` (default: `SliderParam`).
- Changing the control type uses `route_change_param_impl` on the control param id.
- The control name lives on the code object core and can be renamed via
  `set_code_obj_name` when needed.
- `get_latest_project_state_summary` lists the control param as the single entry in
  `sections[].parameters`; use that `paramId` with `set_param_entered_value`,
  `change_param_impl`, or `set_code_obj_name`.

## Realtime vs persistence
- Non-button controls:
  - Frontend updates a pending value and sends `RealtimeUIChange` with a
    `SectionDependencyKey` for the meta control section.
  - Frontend persists the control with `route_set_param_entered_value`
    (50ms debounce).
- Button controls:
  - No persisted value is written.
  - Frontend sends `RealtimeDependencyEvent` with the section's
    `SectionDependencyKey` and a JSON payload (string) that includes
    `actionMode` and `controlParamId`. The event timestamp is stored on
    `timestampMs`.
  - Payload example:
    ```json
    {
      "actionMode": "WEBSOCKET_LISTENER",
      "controlParamId": "param-id"
    }
    ```
- Dropzone controls:
  - `mode=STATEFUL` behaves like other value controls (RealtimeUIChange +
    `route_set_param_entered_value`), storing a JSON payload.
  - `mode=STATELESS` behaves like button controls (no persisted value). Frontend
    sends `RealtimeDependencyEvent` with the section dependency key and a JSON
    payload that includes the attachments plus `sectionId`/`paramInfoId`. File
    attachments include binary metadata (`contentId`, `byteLength`, `mimeType`)
    and the bytes arrive in separate binary frames.
- Password controls:
  - Secrets are stored in the runtime secret store
    (`setta_files/runtime/secrets/passwords.json` or `SETTA_RUNTIME_ROOT`);
    project state keeps `value`/`defaultVal` empty and tracks presence via
    `hasSecret`.
  - The UI shows a "Saved" placeholder when `hasSecret` is true and reveals the
    secret only on demand (`route_get_password_param_value`), which is blocked
    in share mode.
  - Realtime deltas are not emitted for password values; they only persist via
    `route_set_param_entered_value`.

## Dependency graph + generated code
- The dependency graph exports a `SectionNode` for each meta control, using the
  control param value as the section value.
- In generated code, `state.<path>` reads the control value; button controls
  evaluate to `None`.
- MetaControl values are literals; they do not evaluate `state.*` expressions.
  For control-to-control wiring, use a listener script and update the target
  control via `set_param_entered_value` or `emit_to_frontend` with the control
  param id.
- Literal formatting uses the control type (for example,
  `SwitchParam` -> `True`/`False`, `ColorPickerParam` -> quoted string,
  `TextParam` -> `repr(...)`, `PasswordParam` -> `read_password_value(...)`).
- `DropzoneParam` values render as a list of attachment objects when stateful
  (or `[]` when empty/ stateless).

## Listener integration
- Subscribe to value controls using the section dependency name
  (the `SectionDependencyKey` for the meta control).
- Subscribe to button controls by including the section dependency and
  `dependency_mode=ListenerDependencyMode.REALTIME_ONLY` (use `deps=[]` for a wildcard).
- Subscribe to stateless dropzone controls the same way as buttons and decode
  the JSON payload to access attachment metadata, then read binary frames for
  file payloads.
- Listener emits can only update meta controls through the control param id
  (`SectionParamDependencyKey`) or `route_set_param_entered_value`; section-level
  dependency updates are not applied for MetaControl sections.

## Related code
- `backend/setta/types/section_impls.py`
- `backend/setta/types/helpers_lvl2.py`
- `backend/setta/code_gen/dependency_graph.py`
- `backend/setta/code_gen/value_codec.py`
- `frontend/src/components/Section/Layouts/MetaControlArea.tsx`
- `frontend/src/components/Panes/UiEditor/SectionConfig/MetaControlSettings.tsx`
- `frontend/src/state/actions/sections/createSectionsHelper.ts`
- `docs/reference/listener-flows.md`
