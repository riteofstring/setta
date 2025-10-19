# Shared Modifier Typing Plan

## Guiding Principle
Every change in this refactor must flow through the code generators under `frontend/generation/`. Do **not** hand-edit generated Python or TypeScript. Update the relevant generator, then run `source activate.sh && cd frontend && pnpm generate` to refresh both backends and frontends artifacts.

## Goal
Turn `Core.sharedModifier` into a typed Pydantic model so shared fields (e.g., `codeFileBinding`) survive round-trips without losing type information. This keeps code section variants in sync while avoiding the `"dict" object has no attribute "canonical_path"` crashes.

## Context
- Today `sharedModifier` is a plain `dict[str, Any]`.
- `set_effective_impl_value` writes fields there when the key is not listed in `Core.unsharedKeys`.
- When a `CodeFileBinding` lands in `sharedModifier`, Pydantic rehydrates it as an untyped `dict`, breaking downstream code that expects the full model.
- Simply moving `codeFileBinding` into the base impl would desynchronize variants by default, which we want to avoid.

## Refactor Steps
1. **Model Definition via Generators**
   - Extend the generator that produces `backend/setta/types/core.py` so it emits a `SharedModifier` Pydantic model.
   - Teach the generator to list optional fields for every supported shared modifier entry (e.g., `codeFileBinding`, `callable`, `codeObjVariantMap`, etc.).
   - Ensure the generator updates `Core.sharedModifier` to use the new model when it writes `core.py`.

2. **Backend Adjustments via Generators**
   - Update `frontend/generation/generate_effective_impls.py` so the generated `set_effective_impl_value` functions interact with the `SharedModifier` model rather than raw dicts.
   - Adjust `frontend/generation/generate_args_as_typed_dicts.py` (and related helpers) so the emitted typed-dict setters accept the new model-aware types.
   - Confirm serialization/deserialization stays generator-driven: when the generator writes the Pydantic models, they should emit and hydrate full objects without manual patches.

3. **Frontend Schema Updates via Generators**
   - Update the Pydantic-to-Zod conversion pipeline (`frontend/generation/convert_pydantic_to_js.py`) so the generated `sharedModifier` schema mirrors the new model shape in `frontend/src/utils/generatedTypes.ts`.
   - After regeneration, sweep consumer code (e.g., `frontend/src/state/actions/sectionInfos.ts`) for any direct dict usage and rely on the generator-produced typed accessors.

4. **Validation & Tests**
   - Add/adjust backend unit tests to confirm bindings hydrate as `CodeFileBinding` instances.
   - Smoke test a project with multiple code section variants to ensure bindings stay aligned.

## Open Questions
- Full list of fields that must live on `SharedModifier`—confirm via generator inputs or templates.
- Whether any existing serialized project state needs migration once the model is enforced.
- How to expose future shared fields in the model while keeping the generator-driven workflow frictionless.
