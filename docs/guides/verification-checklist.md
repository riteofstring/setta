# Verification Checklist

Use this checklist for every task. Treat CDP visual verification as a hard gate for any UI/visual change.

## 1) Decide if the change is visual
- If UI layout, styling, rendering, or interaction is affected, treat it as visual.
- If not visual, skip CDP and note that in the final response.

## 2) CDP visual verification (required for visual changes)
- Use chrome-devtools-mcp (CDP). Do not rely on a regular browser or manual screenshots alone.
- If CDP access is unavailable, stop and ask the user to enable the extension.
- Verify the specific screen/flow impacted by the change.

## 3) Report verification status in the final response
- Include one line:
  - `CDP visual check: done (brief context)`
  - `CDP visual check: not run (reason)`

## 4) Tests
- Run relevant tests if they exist; otherwise call out missing tests and propose what should be added.

## 5) Resizable Extremes (required when a resizable UI is touched)
- Verify the smallest supported size and a larger near-max size for every resizable area affected by your change.
- Confirm there is no content bleed, clipping, overlap, duplicate scrollbars, or unexpected layout shifts at either size.
- Prefer automated Playwright coverage with geometry assertions over manual-only checks.
