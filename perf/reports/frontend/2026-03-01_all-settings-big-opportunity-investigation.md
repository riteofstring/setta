# All Settings Big-Opportunity Investigation

Date: 2026-03-01
Area: frontend
Branch/Commit: frontend-performance @ dff8bad0 (+ working tree)

## Goal

Identify changes with materially larger upside than recent micro-optimizations for `Settings` project `All Settings` responsiveness.

## Scenario

- Entry point: `http://127.0.0.1:3054/settings`
- Interaction: `Core -> All Settings` tab switch
- Browser/OS: Chrome via CDP on macOS
- Build mode: dev server

## Investigation Findings

### 1) DOM concentration is overwhelmingly in params subtree

- Total elements in page: `9715`
- Elements under `.section-row-pin-main`: `6848` (`70.5%`)
- Elements inside all node subtrees (`.react-flow__node`): `8612` across `42` nodes
- Param rows (`[data-param-row="true"]`): `697`

Largest sections by DOM:

- `sectionSizingPolicy`: `1855` total elements, `1813` in params subtree (`97.7%`)
- `shortcuts`: `665` total elements, `623` in params subtree (`93.7%`)

### 2) ResizeObserver churn is high, but not the biggest remaining lever

Measured over one `Core -> All Settings` transition:

- Observer instances created: `518`
- Callback calls: `226`
- Entries observed: `262`

Top creation callsites:

- `Handle/index.tsx`: `148`
- `sectionSizes.ts`: `74`
- `useColumnWidthDrag.ts`: `74`
- `SectionHeader.tsx`: `74`
- `KwargsControls.tsx`: `74`
- `GroupContainer.tsx`: `74`

Runtime disable experiments:

- Disabling handle observers improved medians only modestly (`~1.7%` elapsed, `~2.1%` long-task in sample).
- Disabling other observer groups did not produce consistent gains.

### 3) DOM reduction probe indicates stronger upside

CSS-only probe (hiding params subtree while still mounting hooks/components) produced:

- elapsed median: `1450.6 ms` -> `1339.6 ms` (`~7.7%`)
- long-task median: `1199 ms` -> `1074 ms` (`~10.4%`)

Because this probe does not remove React mount/subscription work, it likely underestimates a true deferred-mount strategy.

## Proposed Big-Swing Changes

### A) Deferred section body mount in dense views (primary)

- Keep section shell/header mounted.
- Defer `AreaSwitch` body for non-active sections.
- Preserve stable dimensions while deferred; hydrate in frame-batched queue or on activation.

Expected impact:

- Large (`~20-40%`) potential on `Core -> All Settings` long-task/elapsed in this benchmark if dimension churn is controlled.

### B) Read-only inactive-row rendering

- In inactive sections, render lightweight read-only param rows instead of full `ParamInput` controls.
- Mount full editor controls only for active section.

Expected impact:

- High (`~10-25%`) with lower risk than full virtualization.

### C) Param-list virtualization for very large sections

- Window large row lists (`ParamDndList`) and maintain full DnD path only when actively selecting/reordering.
- Start with largest sections (`sectionSizingPolicy`, `shortcuts`) then generalize.

Expected impact:

- High (`~15-30%`) in large-param sections; highest complexity of the three.

## Recommendation

Prioritize `A` first, then `B`, then `C`.  
This sequence targets the dominant DOM/mount hotspot with explicit render-policy controls and the clearest path to a large measurable win.
