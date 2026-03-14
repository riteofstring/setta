# Canvas Engine DOM-Island Readability Plan

## Goal

Replace the hard `DOM_ISLAND_MIN_ZOOM` cutoff with a screen-space readability rule so the experimental canvas engine does not hide readable section content just because the global camera zoom is low.

## Problem

- The current host uses a single zoom threshold for all visible sections.
- That treats a very large section and a small section the same way.
- In practice, large sections can still be readable on screen below the current cutoff, but their DOM islands do not mount.

## Approach

1. Derive a screen-space readability threshold from the old default-section cutoff.
   - Preserve the current behavior for default-sized sections.
   - Allow oversized sections to mount when their projected screen size still exceeds that readability threshold.

2. Keep the existing viewport-window query.
   - Only change which visible sections qualify for DOM-island mounting.

3. Add focused coverage.
   - Vitest: low-zoom host with one large visible section and one default-sized visible section
   - Playwright: isolated project that persists a low viewport zoom and verifies only the readable large section mounts

## Exit Criteria

- Large visible sections can mount below the old global zoom cutoff when they remain readable on screen
- Default-sized sections still stay unmounted at the same low zoom
- Existing virtualization guardrails remain green
