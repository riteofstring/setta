The plan is directionally strong. I would make only these **must-fix** changes: 

1. **Move blocker attribution into Phase 0.** Your primary symptom is the ~52 ms delay *before* handler entry, but interaction spans alone cannot identify the occupying task. Capture Chromium long tasks, timers/microtasks, style/layout/paint, GC, React, and Pixi work.

2. **Reorder and gate the work:** fix duplicate renderers, then pane mutation storms, then remeasure. Build the shared admission coordinator only if remaining traces show competing scheduled work; otherwise Phase 2 risks unnecessary complexity.

3. **Require one actual frame owner and an O(1) camera path.** Disable independent Pixi auto-render/tickers; accumulate input and perform one root-container transform plus one render per admitted frame. Explicitly prohibit per-node/edge/label traversal and scene-wide Pixi hit-testing during movement; use culling/LOD and spatial indexing.

4. **Define the benchmark workload.** Specify node/edge/label counts, visible density, viewport, DPR, refresh rate, and reference hardware. “Normal hardware” and absolute delivery thresholds while recording will otherwise produce flaky or meaningless results.

### Strong references

* **[RapiD OpenStreetMap editor](https://github.com/facebook/Rapid)** — closest architectural model. Its Pixi rewrite reported roughly 5–10× higher frame rates in dense maps. Study its [GraphicsSystem](https://github.com/facebook/Rapid/blob/main/modules/core/GraphicsSystem.js) and [PixiScene](https://github.com/facebook/Rapid/blob/main/modules/pixi/PixiScene.js): controlled ticker ownership, separated scene preparation/draw work, and per-layer culling. ([GitHub][1])

* **[HiGlass](https://github.com/higlass/higlass)** — production multiscale viewer for datasets too large to display at once, with continuous pan/zoom. Its tile/LOD architecture is the best reference for making camera cost depend on visible content rather than total graph size. ([GitHub][2])

* **[Leaflet.PixiOverlay](https://github.com/manubb/Leaflet.PixiOverlay)** — not a complete editor, but its [one-million-marker implementation](https://github.com/manubb/Leaflet.PixiOverlay/blob/master/docs/many-markers.html) is an excellent focused reference: batched particles, zoom by container scaling rather than reprojection, and a ticker active only during animation. ([GitHub][3])

[1]: https://github.com/facebook/Rapid/discussions/738?utm_source=chatgpt.com "Rapid v2.0 beta is here! ❤️ #738"
[2]: https://github.com/higlass/higlass "GitHub - higlass/higlass: Fast, flexible and extensible genome browser. · GitHub"
[3]: https://github.com/manubb/leaflet.pixioverlay "GitHub - manubb/Leaflet.PixiOverlay: Bring Pixi.js power to Leaflet maps · GitHub"
