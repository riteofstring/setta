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
1. **Model Definition via Generators** ✅ (done)
   - The generator now inspects all implementations, unions shared fields (including ones that were previously in `DEFAULT_UNSHARED_KEYS`), and emits `SharedModifier` as a `TypedDict` with per-field `NotRequired[...]` annotations so every key remains optional.
   - Generated artifacts (`backend/setta/types/generated/shared_modifier.py`) and Zod schemas in `frontend/src/utils/generatedTypes.ts` originate from the updated generator. Core/Variant usage stays aligned through the generator output.
   - Conflict comments in the generated `SharedModifier` now surface only when non-base impl classes disagree on a field’s annotation; the generator currently emits no conflicts after splitting ColorPicker `colorChoices` from Dropdown `choices` and renaming the TextBlock-specific mode to `textDisplayMode`.

2. **Backend Adjustments via Generators** 🔄 (deferred)
   - Leave `frontend/generation/generate_effective_impls.py` in its current minimal form; the generated `set_effective_impl_value` continues to trust the typed overloads.
   - Audit back-end callers to ensure they pass fully-typed models (e.g., `CodeFileBinding`) into those setters; reintroduce generator-driven coercion only if we observe regressions.
   - Keep `frontend/generation/generate_args_as_typed_dicts.py` unchanged until we decide to broaden the runtime enforcement story.

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
