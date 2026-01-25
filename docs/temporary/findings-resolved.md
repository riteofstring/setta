# Findings (Merged, still relevant)

## High
### H1) Listener docs default bundle paths stale
- Problem: `get_setta_docs` defaults load `guides/*`; files now under `docs/reference/*` -> `FileNotFoundError`.
- Fix: update `_DOC_SOURCES` to `reference/*` (or add fallback map for old `guides/*`).
- Touch: `backend/setta/mcp/tools/listener_docs.py`
- Tests: backend unit test: default bundle returns `hot_reload` + `examples` without error.

### H2) Pinned params resize ignores share/lock
- Problem: resize handle active even when `canEditLayout=false` or `positionAndSizeLocked=true`; UI resizes, backend rejects.
- Fix: gate handle + `persistPinnedAreaHeight` behind `canEditLayout && !positionAndSizeLocked`; disable handle/stop handler.
- Touch: `frontend/src/components/Params/GroupContainer.tsx`
- Tests: Playwright no-resize/no-request in share/locked; Vitest handle disabled.

## Medium
### M1) Markdown `headingAsSectionName` override ignored for Pydantic overrides
- Problem: `_text_block_heading_as_section_name_overridden` only checks dict; Pydantic overrides ignored -> auto-sets heading.
- Fix: detect Pydantic overrides via `model_fields_set`/`model_dump` and respect explicit `headingAsSectionName`.
- Touch: `backend/setta/types/helpers_lvl2.py`
- Tests: backend unit test with Pydantic override `headingAsSectionName=false`.

### M2) Missing `unpinnedParamsAreaMinHeight` can yield NaN minHeight
- Problem: `useSectionMinMaxDims` reads `sizingPolicy.globals.unpinnedParamsAreaMinHeight` without guard.
- Fix: `Number.isFinite` fallback to constant or ensure backend migration always sets field.
- Touch: `frontend/src/state/hooks/sectionSizes.ts` (+ backend settings load if chosen)
- Tests: backend load legacy settings; frontend unit ensures minHeight finite.

### M3) New section focus can land on param name inputs
- Problem: `focusOnSectionTextInput` selector too broad (`[contenteditable], .cm-content`); param-name CodeMirror wins.
- Fix: prioritize main editor selectors (code/text block containers) then fallback; optionally add data-attr.
- Touch: `frontend/src/utils/tabbingLogic.ts` (+ editor markup if needed)
- Tests: Playwright create Code/Text block; assert focus in main editor.

### M4) Pinned resize can’t return to auto height
- Problem: no path to set `pinnedAreaHeight` back to `auto`; double-click does nothing.
- Fix: detect double-click on resize handle; set `pinnedAreaHeight="auto"` (enum) and skip numeric persist.
- Touch: `frontend/src/components/Params/GroupContainer.tsx`, `frontend/src/components/Params/pinnedResize.ts`
- Tests: Vitest pinnedResize auto case; Playwright double-click handle restores auto.

### M5) Edges strip height cache never shrinks unless ports change
- Problem: `allowDecrease` only when ports key changes; width/label reflow can’t reduce cached height -> inflated `minHeight`.
- Fix: allow decreases on any `ResizeObserver` update; optional small delta threshold to avoid jitter.
- Touch: `frontend/src/components/Params/GroupContainer.tsx` (EdgesStrip)
- Tests: Playwright resize wider; assert strip height / minHeight decreases.

### M6) Param group padding not counted when only unpinned params exist
- Problem: `paramGroupPaddingKey` set inside `ResizablePinnedArea`; with no pinned params padding=0 -> minHeight undercount.
- Fix: measure outer padding in always-mounted container or in `GetUnpinnedParams` when pinned area absent.
- Touch: `frontend/src/components/Params/GroupContainer.tsx`, `frontend/src/state/hooks/sectionSizes.ts`
- Tests: Playwright unpinned-only section at min height shows full row (no clipping).

### M7) Pinned area bottom rounding wrong when unpinned are all edges
- Problem: `shouldRoundBottom` uses unfiltered unpinned list; edge-only unpinned still blocks rounding.
- Fix: use filtered unpinned list (post `filterEdgeInputs`) to decide rounding.
- Touch: `frontend/src/components/Params/GroupContainer.tsx` (GetPinnedParams)
- Tests: Playwright convert all unpinned to edges; expect rounded bottom class.

## Low
### L1) Convert-to-edge button not actually disabled
- Problem: `aria-disabled` only; button still focusable/clickable when `canConvertToEdge=false`.
- Fix: add `disabled` attr; keep `aria-disabled` if needed; keep handler guard.
- Touch: `frontend/src/components/Section/SectionParts/KwargsControls.tsx`
- Tests: Vitest RTL button disabled + not focusable; Playwright tab order skips.

### L2) `focusOnSectionTextInput` leaves stale pending entries
- Problem: pending set never cleared on timeout; can affect later focus.
- Fix: clear on attempt limit and/or on section unmount.
- Touch: `frontend/src/utils/tabbingLogic.ts`
- Tests: Vitest fake timers for timeout cleanup.

### L3) TextBlock header regex runs on every text update
- Problem: header subscribes to full text; regex runs each keystroke.
- Fix: memoize heading detection or compute on blur / derived selector; avoid full-text subscription.
- Touch: `frontend/src/components/Section/Header/SectionHeader.tsx`
- Tests: Vitest render-count or perf smoke.

### L4) `createTopLevelSection` sets active section twice
- Problem: `setActiveSectionIdAndUpdateZIndex` runs immediately and again in `ensureSectionOnTop`.
- Fix: remove immediate set or guard until node exists.
- Touch: `frontend/src/state/actions/sections/createSections.ts`
- Tests: store test asserts single active-section update.

## Resolved (2026-01-25)
### R1) Cleanup: Playwright/Vitest artifact committed
- Fix: removed `frontend/test-results/.last-run.json` and ignored `frontend/test-results/`.
- Touch: `.gitignore`
- Tests: not required.

### R2) Cleanup: personal VS Code theme settings committed
- Fix: removed `workbench.colorCustomizations` from workspace settings.
- Touch: `.vscode/settings.json`
- Tests: not required.

### R3) Performance risk: DOM scanning on every param list mutation
- Fix: observe a single representative row with `ResizeObserver`, throttle updates with `requestAnimationFrame`, and drop subtree scans.
- Touch: `frontend/src/components/Params/GroupContainer.tsx`
- Tests: `pnpm exec vitest run src/components/Params/pinnedResize.test.tsx`
