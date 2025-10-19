# Shared Modifier Typing Plan

## Goal
Turn `Core.sharedModifier` into a typed Pydantic model so shared fields (e.g., `codeFileBinding`) survive round-trips without losing type information. This keeps code section variants in sync while avoiding the `"dict" object has no attribute "canonical_path"` crashes.

## Context
- Today `sharedModifier` is a plain `dict[str, Any]`.
- `set_effective_impl_value` writes fields there when the key is not listed in `Core.unsharedKeys`.
- When a `CodeFileBinding` lands in `sharedModifier`, Pydantic rehydrates it as an untyped `dict`, breaking downstream code that expects the full model.
- Simply moving `codeFileBinding` into the base impl would desynchronize variants by default, which we want to avoid.

## Refactor Steps
1. **Model Definition**
   - Introduce a `SharedModifier` Pydantic model in `backend/setta/types/core.py`.
   - Include optional fields for every shared modifier entry we currently support (e.g., `codeFileBinding`, `callable`, `codeObjVariantMap`, etc.).
   - Update `Core.sharedModifier` to use this model.

2. **Backend Adjustments**
   - Update `set_effective_impl_value` (generated file) to handle attribute access on the `SharedModifier` model instead of dict indexing.
   - Regenerate typed-dict helpers (`impl_args_as_typed_dicts.py`) so setters accept the new types.
   - Ensure serialization/deserialization paths continue to work (Pydantic will now emit proper objects).

3. **Frontend Schema Updates**
   - Update the generation scripts to emit the new shape for the `sharedModifier` Zod schema (`frontend/src/utils/generatedTypes.ts`).
   - Adjust any frontend code accessing `core.sharedModifier` (e.g., `frontend/src/state/actions/sectionInfos.ts`) to use the typed structure.

4. **Validation & Tests**
   - Add/adjust backend unit tests to confirm bindings hydrate as `CodeFileBinding` instances.
   - Smoke test a project with multiple code section variants to ensure bindings stay aligned.

## Open Questions
- Full list of fields that must live on `SharedModifier`—confirm via type generation scripts.
- Whether any existing serialized project state needs migration once the model is enforced.
- How to expose future shared fields in the model without regressing the generator workflow.
