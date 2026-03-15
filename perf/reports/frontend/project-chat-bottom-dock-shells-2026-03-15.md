# ProjectChatBottomDock Shell Extraction

- Date: `2026-03-15`
- Slice: extract shared project-vs-section window shell rendering, body selection, and header-action adaptation out of `frontend/src/components/ChatWindowing/ProjectChatBottomDock.tsx`
- Harness: same-origin CDP harness on `http://127.0.0.1:3002/?__setta_backend_origin=http://127.0.0.1:8002`
- Reason for harness: the normal app shell still fails to boot because `/src/state/actions/aiConfigurationCatalogLoads.ts` does not export `receiveAgentProfilesUpdate`, so visual verification had to run through a seeded same-origin mount

## Historical Baseline

- Seeded window set before the refactor:
  - bottom dock: `dock-review`, `dock-ship`
  - floating: `float-debug`, `float-graph`
  - maximized: `max-plan`
- Historical pre-slice metrics recorded during the baseline harness run:
  - dock panels: `2`
  - floating windows: `2`
  - maximized window: `1`
  - tray pills: `0`
  - harness nodes: `230`
- Screenshot: `perf/reports/frontend/project-chat-bottom-dock-shells-before-2026-03-15.png`

## Post-Slice Check

- Re-ran the seeded harness after extracting `projectChatWindowShell.tsx`.
- Post-slice structural metrics:
  - dock panels: `2` (`dock-review`, `dock-ship`)
  - floating windows: `2` (`float-debug`, `float-graph`)
  - maximized window: `1` (`max-plan`)
  - tray pills: `0`
  - harness nodes on the current seeded subtree: `564`
- Screenshot: `perf/reports/frontend/project-chat-bottom-dock-shells-after-2026-03-15.png`

## Notes

- The shell-specific invariants this slice cares about stayed flat: the same docked, floating, and maximized windows rendered in the same seeded arrangement after the extraction.
- The current subtree node count is higher than the earlier historical baseline because the seeded project-chat surfaces now mount the full current chat controls and git graph internals during the rerun; for this slice, the reliable regression signal is the unchanged shell structure plus the matching screenshot, not the absolute node total alone.
