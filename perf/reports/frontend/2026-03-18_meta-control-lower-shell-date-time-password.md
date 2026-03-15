# Phase S2 MetaControl Lower Shell Date/Time + Password Flattening

Date: 2026-03-18
Worktree: `setta.frontend-performance-11`
Branch: `frontend-performance-11`

## Goal

Remove the lower MetaControl `single-cell-container` / `single-cell-child`
grid contract from the date/time and password control path without reopening
the accepted higher `sectionChrome` grid shell.

## Change

- Production seam:
  - `frontend/src/components/Section/Layouts/MetaControl/MetaControlNode.tsx`
- Focused tests:
  - `frontend/src/components/Section/Layouts/MetaControl/MetaControlNode.test.tsx`
  - `frontend/tests/e2e/params/meta-control-date-time-modes.spec.ts`

Implementation:

- `PasswordControl(...)` no longer uses:
  - `single-cell-container`
  - `grid-cols-[1fr,auto]`
  - `single-cell-child`
  - `col-span-2`
- The password lower shell is now a simpler flex/absolute structure:
  - root lower shell: `relative flex ... items-stretch`
  - password field wrapper: `section-value flex ... flex-1`
  - underline: out-of-flow absolute bottom border
- `DateTimeControl(...)` no longer uses the same two-column lower-shell grid.
- `TextParamDateTimeInput(...)` now rides the surviving flex wrapper passed from
  `MetaControlNode.tsx`, with the underline painted out of flow via the passed
  `borderClassName`.
- The display-only transparent time mode keeps the transparent shell contract:
  - `border-transparent`
  - `bg-transparent`
  - no lower underline border

## Automated Verification

- `pnpm -C frontend exec vitest run src/components/Section/Layouts/MetaControl/MetaControlNode.test.tsx`
  - result: `1` file passed, `7` tests passed
- `./scripts/run-playwright-e2e.sh frontend/tests/e2e/params/meta-control-date-time-modes.spec.ts frontend/tests/e2e/sections/section-sizing.spec.ts`
  - result: `11` passed

Added direct coverage:

- `MetaControlNode.test.tsx`
  - transparent display-only time lower shell stays transparent
  - time input path no longer renders the old two-column grid shell
  - password path no longer renders the old two-column grid shell
- `meta-control-date-time-modes.spec.ts`
  - time display/input toggle keeps the section size stable
  - calendar/input toggle keeps the section width stable
  - the visible control stays inside the section bounds during those toggles

## CDP Compare

Control page:

- untouched `main`
- existing DevTools window: `http://127.0.0.1:3087/sleet_taking`
- representative section: existing display-only time MetaControl

Control read:

- lower shell still contains:
  - `single-cell-container`
  - `grid`
  - `grid-cols-[1fr,auto]`
  - `single-cell-child`
- computed layout:
  - viewport scale: `1`
  - node bounds: `202 x 38.59`
  - shell bounds: `200 x 36.59`
  - outboard menu bounds: `22 x 22`

Worktree page:

- existing DevTools worktree window plus an isolated verification project:
  - compare page: `http://127.0.0.1:3011/salt_broad`
  - isolated verification page: `http://127.0.0.1:3011/empty_spare`
- representative section: display-only time MetaControl on the worktree lower shell

Worktree read:

- lower shell now contains:
  - `relative`
  - `flex`
  - `items-stretch`
- lower shell no longer contains:
  - `single-cell-container`
  - `grid-cols-[1fr,auto]`
  - `single-cell-child`
  - `col-span-2`
- computed layout:
  - viewport scale: `1`
  - node bounds: `202 x 37.59`
  - shell bounds: `200 x 35.59`
  - outboard menu bounds: `22 x 22`

Worktree-only lower-shell sanity reads:

- time input mode on the isolated worktree page:
  - input bounds: `123.85 x 18.59`
  - node bounds: `202 x 38.59`
  - shell bounds: `200 x 36.59`
  - lower shell class stays `relative flex ... rounded-lg border ...`
- password mode on the isolated worktree page:
  - password input bounds: `200 x 14`
  - toggle bounds: `32 x 14`
  - node bounds: `202 x 34`
  - lower shell class stays `relative flex ... items-stretch`

## Visual check

- In DevTools, the untouched `main` and worktree display-only time controls
  stayed visually aligned at the node boundary and outboard menu boundary while
  the worktree lower shell dropped the old two-column grid classes.
- The worktree isolated page kept the expected compact time-input presentation
  and retained the underline inside the same outer bounds when switching between
  display and input mode.
- The worktree isolated password path kept the show-password affordance inside
  the compact MetaControl node without reintroducing the old lower-shell grid.

## Interpretation

- This lower MetaControl slice is accepted:
  - date/time lower shell: flex baseline accepted
  - password lower shell: flex baseline accepted
- The accepted higher `sectionChrome` `windowFlow` shell remains untouched.
- The lower MetaControl seam is not fully exhausted yet:
  - `TextInputControl(...)` in `MetaControlNode.tsx` still uses
    `single-cell-container` / `single-cell-child`
  - the color-picker MetaControl wrapper still rides the shared single-cell
    helper classes
- The next pass should stay in the lower MetaControl seam and decide whether
  the stronger next owner is the text/code MetaControl shell or the color-picker
  wrapper, rather than reopening `sectionChrome`.
