# Reference Image Guided UI Alignment

## Goal
Enable app generation to use a source design image and produce output that matches it as closely as possible.

## Scope
- In scope: optional image input pipeline, style/layout extraction hints, generation constraints.
- Out of scope: pixel-perfect guarantee for every edge case.

## Plan
1. Define image-input contract for app gen requests.
2. Extract usable visual cues (layout structure, spacing, typography, color intent).
3. Feed cues into generation prompt/schema and enforce alignment priorities.
4. Add mismatch reporting/iteration guidance when exact parity is not possible.

## Acceptance Criteria
- Users can provide an image as style/source guidance.
- Generated result follows source image layout/style closely.

## Verification
- Add tests for image-enabled request routing and config handling.
- Add Playwright scenario with sample image and generated output review.
- CDP visual comparison check between source target and generated UI.

## Implementation Notes (February 14, 2026)
- Added optional `referenceImageUrl` and `referenceImageNotes` to `/api/streamAppSpec`.
- Added mode-aware prompt enrichment and multimodal user message content (`image_url`) in app-spec streaming.
- Added backend size limits/validation for reference-image URL and notes.
- Added app-pane controls for reference-image URL/notes in JSON+Image mode.

## Verification Notes
- Backend tests: `tests/routers/test_app_spec_streaming_route.py` covers reference-image size validation.
- Playwright coverage: `frontend/tests/e2e/overview/app-config-json-render-mode.spec.ts` validates in-pane streaming/persistence flow.
- CDP check was run on the updated App Config pane to confirm controls and rendering.
