# Code Obj Value Policy

## Goals
- Make codegen output for code object (param) values configurable per code obj type and per code obj id.
- Preserve current codegen output by default; only change when policy is set.
- Keep the policy next to `SectionCodegenPolicy` on the Python codegen target.

## Current behavior (summary)
- Section values already have a policy: `SectionCodegenPolicy` controls inclusion + representation
  (`json` / `file`) and is resolved in `backend/setta/types/project_config.py`, then applied in
  `backend/setta/code_gen/dependency_graph.py`.
- Code obj values are always stored as strings and formatted in
  `backend/setta/code_gen/value_codec.py` based on `CodeObjType`.
- No per-param or per-type representation controls exist for code obj values.

## Proposed policy model
Add a new policy to the Python codegen target, modeled after `SectionCodegenPolicy` but scoped to
code obj values.

### Types
- `CodeObjValueRepresentationMode` (enum):
  - `literal` (default): current type-specific formatting
  - `json` (optional): parse JSON into a Python object
  - `raw` (optional): always emit the stored string via `repr`
  - (future) `file` / `base64` for attachment content, if needed later
- `CodeObjTypeValuePolicy`:
  - `representation: CodeObjValueRepresentationMode`
- `CodeObjValueOverride`:
  - `representation: CodeObjValueRepresentationMode`
- `CodeObjValuePolicy`:
  - `typePolicies: dict[CodeObjType, CodeObjTypeValuePolicy]`
  - `codeObjOverrides: dict[ID, CodeObjValueOverride]`

### Defaults (match current output)
Use defaults that preserve current behavior:
- `literal` for every code obj type.
- `literal` means “use the existing type-specific formatting that `value_codec` already applies.”

### Resolution order
1. Start with the type policy for the code obj type.
2. Apply `codeObjOverrides[codeObjId]` if present.
3. Validate that the representation is supported for the code obj type.

## Backend plan
1. **Project config model**
   - Add `CodeObjValueRepresentationMode`, policy models, and default policy helper in
     `backend/setta/types/project_config.py`.
   - Add `codeObjValuePolicy: CodeObjValuePolicy` to `ProjectCodegenPythonTarget`.
2. **Policy resolution helpers**
   - Add `resolve_code_obj_value_policy(...)` and validation helpers in
     `backend/setta/types/project_config.py` (parallel to `resolve_section_codegen_policy`).
3. **Dependency graph**
   - Extend `ParamNode` to store `value_representation`.
   - Extend `SectionNode` to carry `control_code_obj_id` (for MetaControl) so the same policy
     can be applied when formatting the section value.
   - During `export_params`, compute and attach the resolved representation for each param node.
   - During `_export_meta_control_section`, compute representation for the control code obj id.
4. **Value codec**
   - Update `PythonValueCodec.format_param_expression` and `_format_meta_control_section` to
     use the node’s representation instead of hard-coded, per-type behavior.
   - Refactor `_format_param_literal` into `format_param_value(param_type, value, deps, rep)`.
   - Implement representation-aware formatting paths (literal / json / raw) with
     per-type validation.
   - Keep the existing fallback behavior for invalid JSON when a representation expects JSON.
5. **Generated types**
   - Run `pnpm generate` after adding new policy types to update:
     - `backend/setta/types/generated/*`
     - `frontend/src/utils/generatedTypes.ts`
6. **No state mutation**
   - Policy only affects codegen output; it should not change stored code obj values or
     share deployment rewriting.

## Frontend plan
1. **Types**
   - Consume the new generated types from `pnpm generate`.
2. **UI (Run Instructions panel)**
   - Add a new "Code Obj Value Policy" section alongside the section policy UI in
     `frontend/src/components/Panes/Overview/RunInstructions.tsx`.
   - Provide per-type dropdowns for representation modes.
   - Provide an override editor to add/remove `codeObjOverrides` by param id.
3. **Persistence**
   - Reuse `route_set_project_config_codegen_targets` to persist the updated policy,
     mirroring how `sectionPolicy` is saved today.

## Docs updates
- Extend `docs/codegen-section-policy-and-metadata.md` to document the new policy.
- Add examples once the first supported representations per type are decided.

## Tests / verification
- Unit tests for `resolve_code_obj_value_policy` and representation validation.
- Unit tests for `PythonValueCodec` representation formatting paths.
- Manual verification:
  - Create a couple of params, set policy to each representation, and confirm generated Python.
