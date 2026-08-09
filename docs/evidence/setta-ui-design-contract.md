# Setta UI redesign — ratified tokens and state matrix (Phase 0)

Ratified 2026-08-10 for the
[Setta-Styled Workspace UI Plan](../plans/setta-styled-workspace-ui-plan.md), Phase 0, from the
verdicts in [setta-ui-visual-reference-matrix.md](./setta-ui-visual-reference-matrix.md). This is
the design contract Phase 2 implements. Names, semantics, and hooks below are fixed; the default
color values are the contract's starting values and change only through the Phase 2 visual review
with refreshed screenshots and contrast checks — never through consumer-visible renames, aliases,
or a transition layer.

## Semantic token additions

`WorkspaceThemeTokens` gains exactly four color roles. Each is exported as a scoped custom
property following the existing `--setta-workspace-<kebab-role>` convention.

| Role                      | Custom property                               | Meaning                                                                                    | Light default                  | Dark default                  |
| ------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------ | ----------------------------- |
| `sectionHeaderBackground` | `--setta-workspace-section-header-background` | The single-line section header band on `default` and `compact` chrome.                     | `oklch(0.975 0.006 255)`       | `oklch(0.24 0.022 255)`       |
| `sectionBorder`           | `--setta-workspace-section-border`            | Section and group hairlines, toolbar dividers, and the stronger locked-border derivation.  | `oklch(0.89 0.014 255)`        | `oklch(0.36 0.03 255)`        |
| `groupBackground`         | `--setta-workspace-group-background`          | The translucent container wash that separates groups from leaf sections at every depth.    | `oklch(0.92 0.015 255 / 0.45)` | `oklch(0.28 0.024 255 / 0.5)` |
| `controlBackground`       | `--setta-workspace-control-background`        | Resting surface for toolbar controls, menus, dialogs, popovers, panes, and editing inputs. | `oklch(0.985 0.004 255)`       | `oklch(0.27 0.024 255)`       |

The existing eleven roles (`canvasBackground`, `gridColor`, `sectionBackground`, `sectionText`,
`sectionMutedText`, `toolbarBackground`, `minimapBackground`, `selection`, `focus`, `invalid`,
`connection`) are retained unchanged in name and meaning. Phase 2 retunes their default values to
the old-Setta anchors from the reference matrix — near-white sections over a quiet cool-slate
canvas in light, near-black sections over deep slate in dark, restrained blue as the only active
color — staying in gamut-safe OKLCH within the hue-255 slate-blue family.

Derivation rules:

- Local hover, pressed, and subtle-elevation colors derive only from semantically compatible
  roles (`color-mix()` of a surface role toward `sectionText` or `selection`), never from
  unrelated roles and never from private selectors a consumer would have to depend on.
- Group depth never multiplies shadows, darkens tint per level, or shrinks typography; depth
  legibility comes from the `groupBackground` wash, padding, and radius contrast alone.
- Accent (`presentation.accentColor`) tints the local header/surface through the existing
  `--setta-workspace-section-local-*` derivation; tags stay small categorical dots. Neither may
  replace `selection`, `focus`, or `invalid` cues.

## Section state matrix

The twelve ratified frame states. Every state keeps a non-color cue, causes no layout shift, and
keeps its accessible name/state; states compose (for example a locked, selected, minimized frame
shows all three cues).

| State     | Source                                                                      | Visual treatment                                                                                                                 | Non-color cue and AT hook                                                                         |
| --------- | --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Default   | —                                                                           | `sectionBackground` surface, `sectionHeaderBackground` header, `sectionBorder` hairline; light elevation at root only.           | Type icon + ~13 px strong title; kind stays in the accessible article name.                       |
| Hover     | Pointer over frame                                                          | Header icon/actions strengthen muted → `selection`-tinted; hairline may strengthen. No new controls appear hover-only.           | Cursor only; hover is never the sole route to any action.                                         |
| Focus     | `:focus-visible` within frame                                               | 2 px `focus` outline on the focused control (title, handle, action), independent of selection.                                   | Visible outline; focus order and restoration per existing contracts.                              |
| Selected  | `data-workspace-selected`                                                   | 2 px `selection` outline around the frame; selected-state actions become visible (not hover-gated).                              | Outline + `aria-pressed`/selection announcement via the existing selection live region.           |
| Moving    | `data-workspace-moving`, `data-workspace-section-move-*`                    | Stronger, non-layout-shifting treatment: `selection`-tinted outline + compact section-shaped overlay and placeholders.           | Placeholder geometry; movement announcements via existing live regions; hysteresis stays visible. |
| Resizing  | `data-workspace-resizing`, `data-workspace-resize-handle`                   | Same strengthened outline family as moving; subtle visible grips only on the selected/focused resizable frame.                   | Full-size hit areas retained; sizing announcements via `data-workspace-sizing-announcement`.      |
| Locked    | `section.positionAndSizeLocked` (`data-workspace-locked`, added in Phase 2) | Tighter corner radius plus a stronger `sectionBorder`-derived border (the old-Setta lock cue); move/resize affordances disabled. | Corner-radius change + lock control state text; blocked-movement announcements unchanged.         |
| Minimized | `data-workspace-minimized`                                                  | Compact header-only surface: icon, title, tag dot, state cues; no body, no permanent pill labels.                                | Header-only geometry; state text remains for assistive technology.                                |
| Detached  | `data-workspace-detached`, `data-workspace-detached-placeholder`            | Placeholder keeps section footprint with a quiet dashed `sectionBorder` treatment; detached window carries full theme.           | Placeholder text + detachment announcements; theme propagates to the detached window.             |
| Invalid   | `data-workspace-section-move-feedback` / external-drop validity             | 2 px `invalid` outline/tint on the rejected target or blocked frame, distinct from `selection` and `focus`.                      | Rejection text in the existing movement/creation announcements; indicator does not flicker.       |
| Read-only | `data-workspace-read-only`                                                  | Full chrome without editing affordances: creation, movement handles, resize grips, and state toggles absent or disabled.         | Disabled semantics on controls; document text unchanged.                                          |
| Culled    | `data-workspace-culled`                                                     | Frame chrome replaced by the lightweight culled placeholder; selected/active frames stay pinned unculled.                        | Placeholder keeps accessible name and geometry so focus and outline navigation stay stable.       |

## Consequences fixed by this contract

- Phase 2 adds `data-workspace-locked` to the frame alongside the existing state attributes so
  locked styling needs no private selector.
- `default`, `compact`, `transparent`, and `none` chrome apply this same matrix; headerless modes
  keep an accessible title, movement surface, selection affordance, and action disclosure.
- The four new roles plus retuned defaults are the complete rebranding surface for this pass: no
  generic design-system engine, no neutral preset, no per-element public selectors.
