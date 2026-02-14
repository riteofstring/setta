# App Gen Prompt Builder + Catalog Expansion Plan

## Context / Goals
- Make JSON-render app generation more controllable without editing a monolithic prompt string.
- Support navigation/layout style choices via presets (and user-saved presets) in the App Config pane.
- Inventory the existing JSON Render catalog and identify the missing primitives needed for “beautiful” standalone apps.
- Add the first missing navigation primitives to the catalog so the agent can build better in-spec navigation when desired.

## Investigation Findings (Current Catalog)
Catalog source: `backend/setta/app/catalog.py`

**Components**
- Layout: `Container`, `Stack`, `Grid`, `Box`, `Spacer`, `Card`, `Divider`
- Motion: `Motion`, `Stagger`
- Scoping: `ConfigScope`
- Navigation-ish: `Tabs`, `Tab` (in-page, not page navigation)
- Text: `Heading`, `Text`
- Setta bindings: `ParamInput`, `ActionButton`, `TextOutput`, `ImageOutput`

**Actions**
- `run`, `reset`, `downloadArtifact`, `downloadBinary`, `openExternalLink`

## What’s Missing For “Beautiful Apps”
- **Page navigation primitives** inside the catalog (a proper navbar / nav links).
- **Richer content**: lists, key/value, tables, empty-states, alerts, badges, etc.
- **Better composition defaults**: consistent page sections, hero headers, multi-column content patterns.

This plan focuses on navigation primitives + prompt-builder controls; richer content components can follow.

## Plan (Implementation Steps)
1. **Add Navigation Prompt Builder UI (App Config Pane)**
   - Add a “Prompt Builder” section in `frontend/src/components/Panes/Overview/App/AppConfigPane.tsx`.
   - Add a “Navigation preset” combobox using Setta’s combobox (`IdNameCombobox`).
   - Add a “Navigation instructions” textarea seeded from the selected preset.
   - Add user preset management (persisted in `useLocalStorage`):
     - Save new preset (name + current textarea).
     - Update/delete selected custom preset.
   - Keep this strictly mobile-friendly and consistent with existing Setta pane styling.

2. **Refactor Prompt Construction Into a Pure Helper**
   - Extract prompt-building into `frontend/src/components/Panes/Overview/App/appGenerationPrompt.ts`.
   - Replace the hardcoded “Pages and navigation:” bullets with the selected navigation prompt block.
   - Unit test the helper to ensure the selected navigation instructions appear in the final prompt.

3. **Expand JSON Render Catalog With Nav Primitives**
   - Update `backend/setta/app/catalog.py` to add:
     - `NavBar` (children allowed; mobile hamburger + desktop inline layout in renderer)
     - `NavLink` (childless; props: `to`, `label`, optional `className`)
   - Update `frontend/src/components/App/appRegistry.tsx` to implement `NavBar`/`NavLink` and register them.
   - Keep props scalar-only to satisfy `backend/setta/app/spec_validation.py` (no array/object props beyond existing “responsive scalar” pattern).

4. **Update Automated Tests**
   - Frontend unit tests:
     - Add/extend tests for the prompt helper (`appGenerationPrompt.test.ts`).
   - Playwright:
     - Update `frontend/tests/e2e/overview/app-config-generate-prompt.spec.ts` to match the new prompt text and confirm navigation instructions are present.

5. **Verification**
   - `pnpm -C frontend exec vitest run` for the new/updated unit tests.
   - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/overview/app-config-generate-prompt.spec.ts`
   - Backend quick check: `source activate.sh && pytest -q tests/app/test_route_validation.py`
   - CDP visual check (separate tab): verify Prompt Builder UI renders, combobox works, and the generated chat prompt reflects the chosen navigation preset.

