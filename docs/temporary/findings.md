# Findings (Merged)

## High
- **Pinned params resize ignores layout/share locks.** The pinned resize handle is always enabled and resize updates are always dispatched (`frontend/src/components/Params/GroupContainer.tsx:475`, `frontend/src/components/Params/GroupContainer.tsx:732`).
  - Example: In share mode, the pinned area resize handle is still draggable; the UI resizes, but the backend rejects the update, leaving the section height visually changed until a refresh.
  - Proposed fix: Gate the handle and `persistPinnedAreaHeight` behind `canEditLayout` and `!positionAndSizeLocked`.
  - UX/DX before: Users can resize in read-only contexts and get misleading visual changes; devs see UI/back-end state divergence.
  - UX/DX after: Resize is disabled where it should be; no optimistic mismatch or rejected updates.
  - Proposed tests: Playwright E2E that opens a share-mode/locked section, attempts to drag the pinned resize handle, and asserts no size change + no resize request; Vitest component test to confirm handle disabled when `canEditLayout` is false or `positionAndSizeLocked` is true.
- **`get_setta_docs` default bundle will fail.** `_DOC_SOURCES` points `examples` and `hot_reload` at `docs/guides/*`, but those files now live under `docs/reference/*`. This causes a `FileNotFoundError` when fetching default listener docs. (`backend/setta/mcp/tools/listener_docs.py:7`)
  - Example: Calling `get_setta_docs` with the default bundle tries to read `docs/guides/hot_reload.md` and fails with `FileNotFoundError`.
  - Proposed fix: Update `_DOC_SOURCES` to `docs/reference/*` (or add a fallback path to the new location).
  - UX/DX before: Docs fetch fails at runtime; devs cannot access listener docs without manual path changes.
  - UX/DX after: Docs load successfully with default settings; no runtime errors or manual fixes.
  - Proposed tests: Backend unit test under `tests/mcp` that calls the default doc bundle and asserts the returned docs include `hot_reload` and `examples` without raising.

## Medium
- **Convert-to-edge button is not actually disabled.** The “Convert selected args to edge connectors” button uses `aria-disabled` but not `disabled`, so it remains focusable/clickable even when `canConvertToEdge` is false (`frontend/src/components/Section/SectionParts/KwargsControls.tsx:219`).
  - Example: With no eligible args selected, the button still receives focus; pressing Enter calls the handler, which immediately returns.
  - Proposed fix: Add the `disabled` attribute (and keep `aria-disabled` if needed) so it matches other disabled buttons.
  - UX/DX before: Keyboard users can tab to a non-functional control; devs see inconsistent disabled behavior.
  - UX/DX after: The button is truly disabled and skipped by tab order; behavior matches other controls.
  - Proposed tests: Vitest + RTL test to render `KwargsControls` with `canConvertToEdge=false` and assert the button has `disabled` and is not focusable; Playwright smoke test to tab through controls and verify the button is skipped.
- **EdgesStrip height caching only allows decreases when ports change.** Width changes (or label reflow) can reduce the actual strip height, but the cached value will remain high and inflate min-height calculations, potentially preventing section shrink. (`frontend/src/components/Params/GroupContainer.tsx:177`)
  - Example: Rename an edge to a shorter label or widen the panel so labels no longer wrap; the strip height visually shrinks, but the cached height stays larger, keeping the section taller than necessary.
  - Proposed fix: Recompute cached height on any measured height change (e.g., via `ResizeObserver`), not only on port changes.
  - UX/DX before: Sections can feel "stuck" at a taller minimum height; devs see layout math that no longer reflects the DOM.
  - UX/DX after: Min height follows actual strip height; sections shrink smoothly as labels reflow.
  - Proposed tests: Playwright E2E that resizes the panel to reflow labels and asserts the section min-height updates; Vitest hook/unit test (if measurable) that updates width and expects cached height to recompute.
- **`paramGroupPadding` only measured when pinned params exist.** It’s measured inside `ResizablePinnedArea` (mounted only when pinned params exist). Sections with only unpinned params/edges will have `paramGroupPadding = 0` in `useSectionMinMaxDims`, so min height can be undercounted and allow slight clipping at minimum size. (`frontend/src/components/Params/GroupContainer.tsx:568`, `frontend/src/state/hooks/sectionSizes.ts:223`)
  - Example: A section with only unpinned params can be resized to a minimum where the bottom padding is cut off because padding was measured as 0.
  - Proposed fix: Measure padding in an always-mounted container (e.g., `_ParamGroupContainer`) or set a known padding constant there.
  - UX/DX before: Slight clipping at minimum size for unpinned-only sections; devs see min-height logic diverge between pinned and unpinned cases.
  - UX/DX after: Min size accounts for padding in all cases; no clipping and consistent sizing logic.
  - Proposed tests: Playwright E2E that creates a section with only unpinned params, drags to min height, and asserts no clipping; Vitest unit test for `useSectionMinMaxDims` to verify padding contribution is non-zero with unpinned-only inputs.

## Low
- **Section header regex runs on every text update.** TextBlock headers now subscribe to the full text and run a regex to decide title visibility (`frontend/src/components/Section/Header/SectionHeader.tsx:125`, `frontend/src/components/Section/Header/SectionHeader.tsx:157`).
  - Example: Typing in a long markdown block triggers a regex scan on every keystroke and re-renders the header even when no headings change.
  - Proposed fix: Memoize the "first heading" value, or compute it only when the text block changes in a meaningful way (e.g., on blur or via a cached selector).
  - UX/DX before: Potential typing stutter on large docs; devs see extra renders in profiling.
  - UX/DX after: Smoother typing with fewer header recalculations; cleaner render traces.
  - Proposed tests: Vitest component test that types into a large markdown block and asserts header render count remains stable when headings do not change; optional Playwright perf trace to ensure no extra reflows on keystrokes.
- **`focusOnSectionTextInput` leaves stale pending entries.** It adds the section to a pending set but never clears it if focus never lands (after 240 frames). This can leave stale entries that affect later focus behavior. (`frontend/src/utils/tabbingLogic.ts:225`)
  - Example: A section is deleted before focus lands; its ID remains in the pending set and can interfere with the next focus attempt.
  - Proposed fix: Clear the entry on timeout and on unmount of the target section.
  - UX/DX before: Occasional focus oddities; devs see hard-to-repro focus bugs.
  - UX/DX after: Focus flow is deterministic; pending state does not accumulate.
  - Proposed tests: Vitest unit test for the focus helper that advances timers to timeout and asserts the pending set is cleared; Playwright E2E that deletes a section before focus and confirms later focus works.
- **`createTopLevelSection` sets active section twice.** It sets the active section immediately, then `ensureSectionOnTop` sets it again once the node appears. If the second call is the real goal, the first call is redundant churn. (`frontend/src/state/actions/sections/createSections.ts:75`)
  - Example: Creating a section triggers two consecutive active-section updates, causing an extra render and state change.
  - Proposed fix: Remove the immediate `setActiveSection` or guard it so only one path fires.
  - UX/DX before: Minor render churn; devs see duplicate state updates in logs.
  - UX/DX after: Single, intentional activation; cleaner state transitions.
  - Proposed tests: Vitest store test to create a section and assert `setActiveSection` is called once; Playwright smoke test that creating a section activates it without flicker.

## Open Questions / Assumptions
- Is there an intended UI flow for **unpinning** params? The new pin action only adds to `pinnedParams`.
- Should pinned-area resize be allowed when a section is locked or in share mode? I assumed “no” based on layout guards elsewhere.
- The switch to H1-only for markdown-derived section titles is intentional. Previously any heading would update the title; now H2/H3-only markdown won’t. (`backend/setta/types/helpers_lvl2.py:1624`, `frontend/src/components/Section/Header/SectionHeader.tsx:137`)
