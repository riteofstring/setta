# Source Image Guided UI Match

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
