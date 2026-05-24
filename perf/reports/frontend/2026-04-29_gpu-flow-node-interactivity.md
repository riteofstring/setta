# GPU Flow Node Interactivity

Date: 2026-04-29

Screen: Settings -> All Settings, visible settings node (`settings-section__gui`)

Method:
- Ran the dev app through `./ai.sh`.
- Used Chrome DevTools MCP on `/settings`.
- Patched `HTMLCanvasElement.prototype.requestPaint` and `GPUQueue.prototype.copyElementImageToTexture` in-page, then triggered a node-local filter input update followed by a Radix switch click.

Baseline before this change:
- `requestPaint`: 6 calls over the sampled interaction.
- `copyElementImageToTexture`: 3 calls total.
- Switch click produced only 1 texture copy after the state change, so the CSS thumb transition was not sampled across frames.
- Active overlay stayed absent during the normal interaction path.

After this change:
- `requestPaint`: 42 calls over the same sampled interaction.
- `copyElementImageToTexture`: 37 calls total.
- Switch click produced repeated texture copies during the interaction window, including copies at roughly 266 ms, 276 ms, 287 ms, 299 ms, 310 ms, and 321 ms after the sample start.
- Active overlay stayed absent in the normal path, so the common case remains GPU-rendered; the overlay sync path is reserved for over-budget fallback.

Interpretation:
- The degraded UX was not pan/zoom cost. We were sampling the interactive node texture once per event, which is insufficient for CSS transitions and fast input feedback in an html-in-canvas texture pipeline.
- A short active-control repaint window restores per-frame sampling for the manipulated node while keeping the rest of the graph on the WebGPU path.
