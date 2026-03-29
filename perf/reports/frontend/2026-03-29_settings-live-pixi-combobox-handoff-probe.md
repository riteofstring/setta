# Settings Live Pixi Combobox Handoff Probe (2026-03-29)

Date: 2026-03-29
Area: frontend
Branch: `pixijs-rewrite`

## Goal

- Check whether the historical combobox / `downshift` activation hotspot still
  dominates the live Pixi value-row handoff path after the recent overlay-shell
  reductions.

## Scenario

- URL:
  - `http://127.0.0.1:3044/settings?liveDictAreaRenderer=pixi-node-body`
- Interaction:
  1. Open `All Settings`.
  2. Click a visible combobox-backed Pixi value-row handoff.
  3. Capture a short DevTools performance profile around the single click.

## Probe

- Fresh-context Chrome DevTools MCP profile on the live worktree runtime.
- Visible handoff row used:
  - `Config Language`
- Overlay result:
  - the Pixi handoff opened a combobox overlay successfully
  - visible choices included `python` and `json`
  - no obvious blanking, broken overlay, or layout glitch was observed in the
    checked viewport

## Observations

- In the short profile window, the old combobox path was still present but no
  longer dominant.
- The hottest sampled work was mostly:
  - `idle`
  - `program`
  - `focus`
  - `elementsFromPoint`
- The old combobox stack only appeared as minor samples:
  - one sample in `downshift`
  - one sample in `useIdNameCombobox`
  - related combobox work present, but not the leading signal

## Verdict

- Do not treat the combobox / `downshift` path as the primary remaining hotspot
  on the live Pixi value-row handoff canary.
- The recent overlay cleanup appears to have reduced that lane enough that the
  next performance investigation should move elsewhere.
- The next retained-scene hotspot probe should focus on the remaining shared
  interaction floor on this canary, likely outside the combobox-specific path.

## Verification Notes

- Targeted Playwright canary:
  - `./scripts/run-playwright-e2e.sh frontend/tests/e2e/settings/settings-all-settings-live-pixi-canary.spec.ts --grep "combobox-backed value row"`
  - result: passed (`1 passed`)
- Chrome DevTools MCP visual/perf check:
  - result: passed
  - page used: `http://127.0.0.1:3044/settings?liveDictAreaRenderer=pixi-node-body`
