# 2026-03-16 appRegistry param-owner extraction

- Scenario:
  - `http://127.0.0.1:3002/racing_busy`
  - CDP-injected app-mode fixture with one text param and one dropdown param
  - viewport baseline/post-check on the default app-mode shell width (`1024px`)
- Why this slice was measured:
  - `frontend/src/components/App/appRegistry.tsx` stopped owning the app param
    binding, edit gating, mutation, and control-rendering path.
- Before:
  - `appRegistry.tsx`: `1753` lines
  - document nodes: `107`
  - app subtree nodes: `27`
  - app subtree width: `1024`
  - app subtree overflow-x: `auto`
  - dropdown present: `true`
- After:
  - `appRegistry.tsx`: `888` lines
  - `appRegistryParamInput.tsx`: `342` lines
  - `appRegistryParamControls.tsx`: `398` lines
  - `appRegistryParamModel.ts`: `154` lines
  - document nodes: `107`
  - app subtree nodes: `27`
  - app subtree width: `1024`
  - app subtree overflow-x: `auto`
  - dropdown present: `true`
  - expanded dropdown option count: `3`
- Result:
  - DOM size and shell layout stayed flat in the measured fixture.
  - The extracted param owner path preserved the visible text-param and
    dropdown surfaces, and the dropdown portal still expanded with the expected
    option count.
