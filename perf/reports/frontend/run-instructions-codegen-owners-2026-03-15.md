# Run Instructions Codegen Owners

Date: `2026-03-15`

## Slice

Extracted the run snapshot and codegen settings branch out of
`frontend/src/components/Panes/Overview/RunInstructions.tsx` into:

- `frontend/src/components/Panes/Overview/runInstructionsCodegenSections.tsx`
- `frontend/src/components/Panes/Overview/runInstructionsCodegenPolicyContent.tsx`
- `frontend/src/components/Panes/Overview/runInstructionsCodegenModel.ts`

## Baseline

CDP check on `http://127.0.0.1:3002/racing_busy` with the Run Instructions pane
selected and the default collapsed accordion state:

- Viewport: `1400x900` window (`1400x862` page)
- `RunInstructions.tsx`: `1908` lines before the extraction
- DOM metrics:
  - `allNodes`: `831`
  - `paneNodes`: `85`
  - `policyToCustomGap`: `56`
  - scroll region: `961x762`
  - `overflowX=hidden`, `overflowY=scroll`

## After

Same page and pane after the extraction:

- `RunInstructions.tsx`: `555` lines
- `runInstructionsCodegenSections.tsx`: `434` lines
- `runInstructionsCodegenPolicyContent.tsx`: `871` lines
- `runInstructionsCodegenModel.ts`: `239` lines
- DOM metrics at the same `1400x900` window (`1400x862` page):
  - `allNodes`: `831`
  - `paneNodes`: `85`
  - `policyToCustomGap`: `56`
  - scroll region: `961x762`
  - `overflowX=hidden`, `overflowY=scroll`
- Narrow viewport check at `1024x720` window (`1024x720` page):
  - scroll region: `906x620`
  - `scrollWidth === clientWidth`
  - all accordion trigger widths stayed aligned at `892px`

## Notes

- The extracted codegen policy accordion still rendered generated metadata,
  section allowlist/default/override controls, and code obj
  default/override controls in CDP.
- The before/after DOM metrics stayed flat for the default collapsed state,
  which is the expected outcome for this behavior-preserving ownership split.
- Console noise after the narrow viewport squeeze still included the existing
  React 19 `element.ref` warnings and unrelated Git Graph SVG width warnings.
