# Settings Live Pixi Overview LOD Perf Probe (2026-03-29)

Date: 2026-03-29
Area: frontend
Branch: `pixijs-rewrite`

## Goal

- Measure whether the low-zoom Pixi `overview` presentation mode provides a
  meaningful performance win over always rendering `detail`, and check whether
  the overview-to-detail switch introduces an obvious hitch.

## Scenario

- URL:
  - `http://127.0.0.1:3044/settings?liveDictAreaRenderer=pixi-node-body`
- Page:
  - `All Settings`
- LOD threshold under test:
  - [`frontend/src/components/Params/liveDictAreaPixiSceneView.ts:209`](/Users/jeff/Documents/_projects/setta.pixijs-rewrite/frontend/src/components/Params/liveDictAreaPixiSceneView.ts#L209)
- Measurement method:
  1. Open the live Pixi settings canvas in Chrome DevTools MCP.
  2. Capture a short performance trace around a single zoom-button click.
  3. Repeat with the normal overview threshold in place and with
     `getLiveDictAreaPixiPresentationMode(...)` temporarily forced to return
     `"detail"`.
  4. Restore the threshold logic after the forced-detail traces.

## Probe A: Threshold-Crossing Zoom

- Start transform:
  - `translate(607.18px, 352.226px) scale(0.220114)`
- Interaction:
  - single `zoom in` click
- End transform:
  - `translate(568.616px, 331.271px) scale(0.264137)`

### Overview Enabled

- Visible cards started in `overview` and ended in `detail`.
- Trace result:
  - `INP`: `57 ms`
  - input delay: `1 ms`
  - processing: `1 ms`
  - presentation delay: `55 ms`

### Forced Detail

- Visible cards started and ended in `detail`.
- Trace result:
  - `INP`: `73 ms`
  - input delay: `1 ms`
  - processing: `1 ms`
  - presentation delay: `71 ms`

### Threshold-Crossing Comparison

- In this trace pair, allowing the overview-to-detail switch was `16 ms`
  faster than forcing detail for the same zoom step.
- The slow path in both traces was presentation delay rather than JS event
  processing.
- This sample does not support the claim that the mode switch itself creates
  the dominant hitch. The forced-detail trace was worse.

## Probe B: Deep Min-Zoom Step

- Start transform:
  - `translate(712.4px, -9.2px) scale(0.1)`
- Interaction:
  - single `zoom in` click to `scale(0.12)`

### Forced Detail

- Run 1:
  - `INP`: `156 ms`
- Run 2:
  - `INP`: `119 ms`
- Average:
  - `137.5 ms`

### Overview Enabled

- Run 1:
  - `INP`: `155 ms`
- Run 2:
  - `INP`: `168 ms`
- Average:
  - `161.5 ms`

### Deep-Zoom Comparison

- These samples do not show a consistent deep-zoom performance win for
  `overview`.
- At absolute min zoom, overview was effectively flat to slightly worse than
  forced detail in this small sample.
- The traces were again dominated by presentation delay rather than callback
  CPU.

## Verdict

- Current evidence is mixed:
  - near the actual overview/detail transition, overview was faster than
    forced detail for the measured zoom step
  - at absolute min zoom, overview did not show a clear performance gain
- This is not strong evidence that the overview LOD is broadly justified on
  performance alone.
- If the product reason for overview is readability at tiny card sizes, that
  remains a UX decision.
- If the product reason is performance, the current probe does not establish a
  reliable win large enough to justify the mode by itself.

## Recommended Follow-Up

- If overview stays:
  - add hysteresis around the threshold so the mode cannot flap when zoom sits
    near the cutoff
- If overview is questioned:
  - run one more probe on pan/scroll at low zoom, not just zoom-button clicks,
    before removing it outright
- In either case:
  - treat presentation/compositor delay as the main remaining cost center

## Verification Notes

- Chrome DevTools MCP perf check:
  - result: passed
  - live page used: `http://127.0.0.1:3044/settings?liveDictAreaRenderer=pixi-node-body`
- Temporary forced-detail edit was reverted after the traces.
