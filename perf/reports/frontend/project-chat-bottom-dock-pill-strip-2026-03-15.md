# Project Chat Bottom Dock Pill Strip

Date: `2026-03-15`
Slice: `ProjectChatBottomDock` minimized-pill strip ownership extraction

## Context

- CDP verification used a same-origin harness on `http://127.0.0.1:3002`.
- The normal app shell was still blank because of the unrelated `aiConfigurationCatalogLoads.ts` import error (`receiveAgentProfilesUpdate` export missing), so the harness imported `ProjectChatBottomDock` directly and seeded minimized project-AI windows.

## Before

- Wide viewport (`900x772` inner size) with four minimized windows:
  - visible pills: `4`
  - visible titles: `Plan`, `Review`, `Ship`, `Launch`
  - cycle controls: absent
  - manager trigger: visible
- Narrow viewport (`500x772` inner size) with the same four minimized windows:
  - visible pills: `0`
  - cycle controls: absent
  - manager trigger: visible
  - manager menu reopen rows after opening the menu: `4`

## After

- Wide viewport (`900x772` inner size) with four minimized windows:
  - visible pills: `4`
  - visible titles: `Plan`, `Review`, `Ship`, `Launch`
  - cycle controls: absent
  - manager trigger: visible
  - strip-specific node count (`[data-testid^="project-chat-bottom-dock"], [data-chat-pill-measure-row]`): `14`
- Narrow viewport (`500x772` inner size) with the same four minimized windows:
  - visible pills: `0`
  - cycle controls: absent
  - manager trigger: visible
  - manager menu reopen rows after opening the menu: `4`
  - strip-specific node count (`[data-testid^="project-chat-bottom-dock"], [data-chat-pill-measure-row]`): `6`
- Screenshots:
  - `perf/reports/frontend/project-chat-bottom-dock-pill-strip-after-wide-2026-03-15.png`
  - `perf/reports/frontend/project-chat-bottom-dock-pill-strip-after-narrow-2026-03-15.png`
  - `perf/reports/frontend/project-chat-bottom-dock-pill-strip-after-narrow-menu-2026-03-15.png`

## Result

- The extracted `projectChatBottomDockPillStrip.tsx` owner preserved the same wide and narrow minimized-pill strip behavior in the harness while moving responsive mode selection, cycle state, menu shell ownership, and strip layout animation bookkeeping out of `ProjectChatBottomDock.tsx`.
- No DOM inflation showed up in the strip harness after the extraction: the wide checkpoint stayed at four visible pills, and the narrow checkpoint still collapsed cleanly into the manager menu with the same four reopen rows.
