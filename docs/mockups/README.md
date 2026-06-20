# Workflow graph — aesthetic explorations

Exploratory, throwaway visual mockups for the workflow graph (not production code).
The real graph is rendered with Pixi.js in
`desktop/src/renderer/src/features/workspace-graph/`; these are standalone canvas
sketches meant only to pick a **visual direction + animation style**.

## How to view

Open `workflow-graph-aesthetics.html` in any browser:

```sh
open docs/mockups/workflow-graph-aesthetics.html
```

- Switch directions with the top pills, the `1`–`4` keys, or a URL hash
  (`…aesthetics.html#factory`).
- `▶` (or space) replays the simulated run.
- Drag to pan, scroll to zoom, **click a node** to see the "details on demand" panel.

All four directions render the *same* sample workflow
(`Start → Fetch → Valid? → Process / Retry → Merge → Summarize → Done`) so they're
directly comparable. The run loops automatically, lighting up the active path and
showing one branch fail, so you can judge how each style communicates state.

## The four directions

| # | Direction | Feel | How it shows "what's happening" |
|---|-----------|------|---------------------------------|
| 1 | **Neon Circuit** | Tron / synthwave. Dark void, glowing wires, sharp edges. | Bright energy pulses race down the active edge; running node pulses, failed node burns red. |
| 2 | **Cozy Constellation** | Friendly puzzle game. Soft bobbing cards, pastel nebula bg. | Soft beads drift along ribbons; gentle colour + chunky icon chip per status. Calmest / least busy. |
| 3 | **Holo Command** | Starship HUD. Glass panels, reticle brackets, scanlines. | Segmented data packets flow through conduits; corner brackets lock on active/hovered nodes. |
| 4 | **Factory Flow** | Factorio builder. Beveled machines, conveyor belts. | Belts physically carry item blocks between machines; gears spin while a node works. Most literal. |

Status colours mirror the real app: not-started (slate), running (teal),
succeeded (green), failed (red), waiting-approval (amber).

These aren't mutually exclusive — e.g. Neon's energy pulses could ride Factory's
node chrome, or Cozy's calm palette could use Holo's packet flow. Pick a base, then
we can graft the bits you like from the others.
