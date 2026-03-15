# Project Chat Bottom Dock Layout

Date: `2026-03-15`
Slice: `ProjectChatBottomDock` layout-math extraction

## Context

- CDP verification used a same-origin harness on `http://127.0.0.1:3002`.
- The normal app shell was still blank because of the unrelated `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate` export missing), so the harness imported `ProjectChatBottomDock` directly and seeded three bottom-docked project-AI windows (`Plan`, `Review`, `Ship`).

## Before

- Wide viewport (`900x772` inner size):
  - visible panels: `2`
  - visible titles: `Review`, `Ship`
  - minimized tray pills: `1`
  - dock manager trigger: visible
  - dock cycle controls: present
- Narrow viewport (`520x772` inner size):
  - visible panels: `0`
  - minimized tray pills: `0`
  - dock manager trigger: visible
- Screenshot: `perf/reports/frontend/project-chat-bottom-dock-layout-before-2026-03-15.png`

## After

- Wide viewport (`900x772` inner size):
  - visible panels: `2`
  - visible titles: `Review`, `Ship`
  - minimized tray pills: `1`
  - dock manager trigger: visible
  - dock cycle controls: present
- Narrow viewport (`520x772` inner size):
  - visible panels: `0`
  - minimized tray pills: `0`
  - dock manager trigger: visible
  - overflow menu entries after opening the manager menu: `Plan`, `Review`, `Ship`
- Screenshots:
  - `perf/reports/frontend/project-chat-bottom-dock-layout-after-2026-03-15.png`
  - `perf/reports/frontend/project-chat-bottom-dock-layout-after-narrow-2026-03-15.png`

## Result

- The extracted `projectChatBottomDockLayout.ts` owner preserved the same responsive dock-window selection behavior at both the medium-width and narrow-width checkpoints.
- No new DOM inflation was observed in the harness: the wide layout still rendered two dock panels plus one tray pill, and the narrow layout still collapsed the docked windows into the overflow menu.
