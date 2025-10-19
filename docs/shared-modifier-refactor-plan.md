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
   - Add a dedicated generator script (e.g., `frontend/generation/generate_shared_modifier.py`) that inspects every section and code-obj impl via `get_impl_classes()` to gather their modifier-capable fields.
   - Build a union of those keys with their Python annotations (including entries currently listed in `DEFAULT_UNSHARED_KEYS`), fail fast if two impls introduce the same key with incompatible types, and emit a generated module `backend/setta/types/generated/shared_modifier.py` defining a `TypedDict` `SharedModifier` (likely `total=False`) so unset values remain absent.
   - Update `backend/setta/types/core.py` and `Variant` to import the generated mapping so `sharedModifier`/`modifier` rely on the partial typed dict while Core/Variant continue to handle type coercion.

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
- Are the helper methods we added to `SharedModifier` (e.g., `as_dict`, `items`, `__iter__`) actually necessary, or can we lean on Pydantic’s `model_dump`/`model_dump_json` in consumers instead?
- How should we eliminate the fields that currently require multiple type annotations (e.g., `displayMode`, `choices`)? Audit the contributing impl classes and either align them on a shared type or rename the conflicting attributes so the generator can emit a single annotation.
- Full list of fields that must live on `SharedModifier`—confirm via generator inputs or templates.
- Whether any existing serialized project state needs migration once the model is enforced.
- How to expose future shared fields in the model while keeping the generator-driven workflow frictionless.
