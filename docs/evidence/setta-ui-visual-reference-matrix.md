# Setta UI redesign — visual reference matrix (Phase 0)

Recorded 2026-08-10 for the
[Setta-Styled Workspace UI Plan](../plans/setta-styled-workspace-ui-plan.md), Phase 0. This matrix
reviews the old Setta frontend at `main` commit `043d3b2e9c69caf99d1246f1408b3ad7194b7864` and
ratifies, cue by cue, what the redesigned `@setta/workspace` chrome preserves, modernizes, or
discards. It is evidence and a design decision record only: no old application code, Tailwind
setup, state, or component tree may be imported.

Verdict vocabulary:

- **Preserve** — carry the visual identity into the package, re-expressed through package CSS and
  semantic tokens.
- **Modernize** — keep the intent but change the values to meet the plan's accessibility, sizing,
  or motion requirements.
- **Discard** — do not reproduce; the cue is app-domain machinery, legacy noise, or conflicts with
  the plan.

Color notation below quotes the old Tailwind classes verbatim. `setta-N` refers to the old
slate-blue ramp in `main:frontend/tailwind.config.js`. Token names refer to the ratified roles in
[setta-ui-design-contract.md](./setta-ui-design-contract.md).

## Section surfaces and outlines — `sectionChrome.ts`

| Cue                                                                                            | Old value                                                                  | Verdict   | Package translation                                                                                                |
| ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------ |
| White / near-black section surfaces                                                            | `bg-white dark:bg-setta-925`                                               | Preserve  | Tonal anchors for `sectionBackground`: near-white in light, deep slate-black in dark.                              |
| Active section outline                                                                         | `outline-4 outline-blue-600 dark:outline-blue-700`                         | Modernize | 2 px `selection` outline. 4 px is heavier than the plan's restrained active blue.                                  |
| Transient press outline                                                                        | `[&:active…]:outline-cyan-300`                                             | Discard   | Selection is explicit and announced; a separate cyan press flash is noise.                                         |
| Light border invisible on white, visible in dark                                               | `border-white dark:border-setta-700`                                       | Modernize | One quiet visible hairline in both appearances via the new `sectionBorder` role.                                   |
| Locked sections change corner radius and border                                                | `rounded-sm` + `border-setta-400/90 dark:border-setta-800` vs `rounded-lg` | Preserve  | Lock keeps a non-color cue: tighter corners plus a stronger `sectionBorder`-derived border.                        |
| Animated corner-radius transition                                                              | `transition-radius`                                                        | Modernize | Keep, at ~120 ms, interruptible, disabled under `prefers-reduced-motion`.                                          |
| Domain outline colors (global-variables green, other-project purple/fuchsia, missing-JSON red) | `outline-green-600`, `outline-purple-600`, `outline-red-600`, …            | Discard   | App-domain semantics. The package keeps exactly `selection`, `focus`, and `invalid` as state colors.               |
| Per-section style theming through scoped CSS variables                                         | `--setta-section-style-bg/border/outline/text/…`                           | Preserve  | Same idea already shipped: `presentation.accentColor` drives `--setta-workspace-section-local-*` derived surfaces. |
| Meta-control transparent chrome with hover-only outline                                        | `bg-transparent` + `group-hover…outline-setta-400/60`                      | Discard   | App-specific control style; hover-only affordances violate the plan's accessibility rules.                         |

## Group containers — `ContainerCore.tsx`

| Cue                                           | Old value                                                                   | Verdict   | Package translation                                                                                     |
| --------------------------------------------- | --------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------- |
| Translucent slate group surface               | `bg-setta-100/40 dark:bg-setta-860/50`                                      | Preserve  | The new `groupBackground` role defaults to a translucent cool-slate wash in both appearances.           |
| Large rounded group container                 | `rounded-3xl`                                                               | Preserve  | Containers keep a visibly broader radius than leaf sections.                                            |
| Quiet group hairline border                   | `border-setta-50/50 dark:border-setta-700`                                  | Preserve  | Group border derives from `sectionBorder` at reduced strength.                                          |
| Locked group corner/border change             | `rounded-sm border-setta-400/90 dark:border-setta-975/35`                   | Preserve  | Same lock cue as leaf sections.                                                                         |
| Inline single-row group header                | `min-h-10` row: menu button, title, actions                                 | Preserve  | Groups keep one inline header row inside the group surface.                                             |
| Muted small group title                       | `text-setta-500 tracking-tighter`                                           | Modernize | Titles move to the ratified ~13 px strong-weight treatment; muted color stays quieter than leaf titles. |
| Generous contained padding                    | `px-6 pb-6 pt-2`                                                            | Preserve  | Group content keeps clear contained padding so descendants read as contents, not stacked cards.         |
| Large dashed empty-drop hint, title-case copy | `border-4 border-dashed border-setta-300 rounded-xl` “Drop A Section Here.” | Modernize | Quiet “Drop sections here” affordance that strengthens only while a compatible drag is active.          |
| Minimum group width                           | `min-w-[250px]`                                                             | Discard   | The package sizes groups from the document and content, not a hard-coded app minimum.                   |

## Section header — `SectionHeader.tsx`

| Cue                                     | Old value                                                                          | Verdict   | Package translation                                                                                      |
| --------------------------------------- | ---------------------------------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------- |
| Compact single-row header               | `section-title mx-2 flex flex-row items-center`                                    | Preserve  | One primary header row; the permanent second “kind” line is removed.                                     |
| 11 px bold title                        | `text-[.7rem] font-bold tracking-tight truncate`                                   | Modernize | ~13 px strong-weight title with restrained tracking and truncation.                                      |
| Blue focus border on the editable title | `focus-visible:border-blue-500` (+ `bg-setta-100 dark:bg-setta-800` while editing) | Preserve  | Focus cues stay visible and blue via the `focus` role; editing surfaces derive from `controlBackground`. |
| Small tag color dot                     | `h-2.5 w-2.5 rounded-full ring-1 ring-black/10 dark:ring-white/10`                 | Preserve  | Exact treatment for `presentation.tagColor`: a small categorical dot with a hairline ring.               |
| Trailing action cluster                 | `ml-auto flex items-center`                                                        | Preserve  | Contextual actions keep trailing placement; secondary actions collapse into one overflow popover.        |
| Diagnostics pills and uppercase badges  | 8–11 px uppercase amber/sky/red pills, blur, shadows                               | Discard   | App diagnostics. Package state text stays available to assistive technology without permanent pills.     |

## Header icons — `HeaderIcon.tsx`

| Cue                              | Old value                                                    | Verdict   | Package translation                                                                                                   |
| -------------------------------- | ------------------------------------------------------------ | --------- | --------------------------------------------------------------------------------------------------------------------- |
| 16 px type icons                 | `h-[16px] w-[16px]`                                          | Preserve  | Registered per-kind icons render at 16–18 px stroke size.                                                             |
| Muted-to-blue hover behavior     | `text-setta-300 → blue-500`, dark `text-setta-500 → #0084ff` | Modernize | Keep muted-resting/blue-active, driven by `sectionMutedText` and `selection`; never hover-only for essential actions. |
| Type-specific icon hue overrides | purple links, green run icons, pink hover                    | Discard   | Icon color stays semantic; kind identity comes from the registered icon shape.                                        |
| 9 px monospace kind label        | `font-mono text-[9px] tracking-tighter`                      | Discard   | Kind text leaves the permanent header; it stays in the accessible name, tooltip, and creation UI.                     |

## Viewport controls — `forks/xyflow/controls/Controls.tsx`

| Cue                          | Old value                                                      | Verdict   | Package translation                                                                         |
| ---------------------------- | -------------------------------------------------------------- | --------- | ------------------------------------------------------------------------------------------- |
| Narrow vertical grouped rail | `w-8 flex-col gap-1 rounded-md border px-0.5 pb-2 pt-1.5`      | Preserve  | The toolbar becomes a narrow Setta rail with grouped controls on `toolbarBackground`.       |
| Subtle group dividers        | `h-px bg-setta-200/70 dark:bg-setta-800/70`                    | Preserve  | Hairline dividers between control groups, derived from `sectionBorder`.                     |
| Blue active control          | `text-white bg-blue-500` / dark `text-blue-600 bg-transparent` | Modernize | One consistent active recipe in both appearances from `selection` over `controlBackground`. |
| Muted inactive, darker hover | `text-setta-400 dark:text-setta-600`, hover `text-setta-600`   | Preserve  | Resting controls stay quiet; hover strengthens without layout shift.                        |
| Visible blue focus ring      | `focus-visible:ring-2 focus-visible:ring-blue-500`             | Preserve  | `focus` role, always visible on keyboard focus.                                             |
| 24–32 px control hit areas   | `h-6 w-6` buttons in a `w-8` rail                              | Modernize | Icons stay 16–18 px, but hit areas grow to ≥40 px (≥44 px coarse pointer).                  |

## Minimap — `ResponsiveMiniMap.tsx`

| Cue                               | Old value                                                              | Verdict  | Package translation                                                                               |
| --------------------------------- | ---------------------------------------------------------------------- | -------- | ------------------------------------------------------------------------------------------------- |
| Compact translucent minimap       | `rounded-md shadow-md backdrop-blur-sm` + transparent border           | Preserve | Small quiet minimap on `minimapBackground`; blur is subject to the Phase 1/2 paint-cost evidence. |
| Slate viewport mask               | light `rgba(51,65,85,0.3)`, dark `rgb(20,22,31,0.5)`, 2 px mask stroke | Preserve | Same translucent mask treatment tuned per appearance.                                             |
| Slate node fills                  | light `#e2e8f0`, dark `#2D384D`                                        | Preserve | Minimap nodes stay tonal slate, not per-kind colored.                                             |
| Upstream demo node colors         | `#0041d0`, `#ff0072`, `#1a192b` by node type                           | Discard  | React Flow demo remnants.                                                                         |
| Side placement, pan, click-center | `pannable`, `onClick` → `setCenter`, side toggle                       | Preserve | Already package behavior; keep it.                                                                |
| App-pane position offsets         | `translateX` by overview/editor pane widths                            | Discard  | Host layout concern, not package chrome.                                                          |

## Palette and motion — `tailwind.config.js`

| Cue                          | Old value                                               | Verdict   | Package translation                                                                                      |
| ---------------------------- | ------------------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------- |
| Setta slate-blue tonal ramp  | `setta-50…975`: `hsl(219–222, 24–33%, 0.5–95%)`         | Preserve  | The ratified OKLCH palette keeps this cool slate-blue family (hue ≈ 255–262, low chroma) as the base.    |
| Global `.dark` class theming | `darkMode: "class"`                                     | Discard   | The package keeps `appearanceOptions.appearance` plus scoped custom properties under `.setta-workspace`. |
| Work Sans heading font       | `fontFamily.heading`                                    | Discard   | The package inherits the host font family and bundles no brand font.                                     |
| 200–300 ms decorative motion | `slideDown/slideUp 200ms`, `fade-in 300ms`, `slow-dash` | Modernize | Ordinary transitions target ~120 ms, opacity/color/transform only, disabled under reduced motion.        |

## Standing exclusions

Regardless of table verdicts above, the plan's global exclusions hold: no 11 px titles, no sub-40 px
hit targets, no hover-only access to any action, no global `.dark` strategy, no Tailwind utility
coupling, and no app/backend state. The new implementation keeps ≥40 × 40 px desktop and
≥44 × 44 px coarse-pointer interaction areas, visible `:focus-visible`, non-color state cues, 200%
zoom and 320 px reflow, and the current keyboard and screen-reader contracts.
