# Improve Empty-Input JSON Render Fidelity

## Goal
Improve default app quality when users run JSON render without extra prompt input.

## Scope
- In scope: catalog quality, default component/style selection, optional on-demand component install flow.
- Out of scope: requiring user-provided prompts for acceptable output.

## Plan
1. Audit current zero-input outputs and identify weakest layout/style patterns.
2. Improve template/catalog defaults to produce cleaner information hierarchy.
3. Define strategy for optional on-demand component installation if needed.
4. Add quality gates for spacing, typography, and component consistency.

## Acceptance Criteria
- JSON render without user input produces materially better baseline UI.
- Output is closer to Setta visual style by default.

## Verification
- Add snapshot/regression tests on representative JSON schemas.
- Add Playwright output quality checks for default generation flows.
- CDP visual check comparing baseline before/after outputs.

## Implementation Notes (February 14, 2026)
- Updated App Config default starter spec to improve hierarchy, naming, and baseline content structure.
- Added mode-specific default generation prompts so zero-input generation is still guided and non-empty.

## Verification Notes
- Playwright updates in `frontend/tests/e2e/overview/app-config-fields.spec.ts` and `frontend/tests/e2e/overview/app-config-live-preview.spec.ts` validate the improved starter baseline.
- CDP check was run on the App Config pane to validate updated default generation surface.
