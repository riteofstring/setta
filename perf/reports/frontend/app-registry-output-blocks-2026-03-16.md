# App Registry Output Blocks Extraction

Date: 2026-03-16

## Scope

- `frontend/src/components/App/appRegistry.tsx` now acts as the registry
  coordinator for layout primitives, action buttons, tabs, motion blocks, and
  config scope registration.
- `frontend/src/components/App/appRegistryOutputBlocks.tsx` now owns
  config-bound `TextOutput` or `ImageOutput` rendering, text-output
  resolution, markdown typography, cached image artifact lookup, and decoded
  image readiness.

## Measurements

- File-size shift:
  - `appRegistry.tsx`: `888 -> 654` lines
  - `appRegistryOutputBlocks.tsx`: `260` lines
- CDP baseline and after-check used the same injected `AppRenderer` overlay on
  `http://127.0.0.1:3002/home` because the full app-mode route bootstraps
  through `AppWrapper` and backend session loaders that are unrelated to this
  output-block refactor.
- Baseline overlay measurements:
  - `1440x900`: surface `420x161`, subtree `9` nodes, no horizontal overflow
  - `960x900`: surface `420x161`, subtree `9` nodes, no horizontal overflow
- After extraction, the same overlay measurements stayed flat:
  - `1440x900`: surface `420x161`, subtree `9` nodes, no horizontal overflow
  - `960x900`: surface `420x161`, subtree `9` nodes, no horizontal overflow

## Result

- The app registry root shrank materially without changing the visible
  text-output surface in the repeatable CDP scenario.
- Output-specific behavior is now easier to find: config-bound output lookup
  and artifact/decode handling live in one local owner instead of being mixed
  into the main app registry file.
