# Remaining controls and meta-controls frozen-reference evidence

This is the supervised pre-implementation reference for the authorized remaining-controls and
meta-controls milestones. It records frozen Setta main at
`043d3b2e9c69caf99d1246f1408b3ad7194b7864`; it is not package-output acceptance and cannot satisfy
the consolidated developer gate.

## Provenance and fixture

- Reference worktree: `../setta-main`, verified at the frozen commit above and never edited.
- Reference URL: `http://127.0.0.1:3000/baking_taking`.
- Browser viewport: 1512 x 861 CSS px; device pixel ratio: 2.
- Appearance: dark and light through Setta's product appearance control.
- Disposable project id: `d15321b3a5129549db6329b23d7dfc96`, named `baking_taking`.
- One Dict section, **Remaining parameter controls**, demonstrated slider, rotary, password,
  multiline text, date, time, and dropzone as ordinary rows.
- Twelve separate meta controls demonstrated Button, Text, Time, TextArea, Date, Password,
  Dropdown, Dropzone, Switch, Slider, Rotary, and Color directly on the canvas. The Date fixture was
  also switched to the Calendar preset (multiple selection, Sunday week start).
- The temporary project was removed after capture. No fixture application code or dependency was
  added to frozen main.

## Screenshot index

| File                                                      | Recorded state                                                           |
| --------------------------------------------------------- | ------------------------------------------------------------------------ |
| `reference/screenshots/00-meta-controls-dark.jpg`         | All direct-on-canvas meta-control types in dark appearance               |
| `reference/screenshots/01-meta-controls-light.jpg`        | The same meta-control fixture in light appearance                        |
| `reference/screenshots/02-remaining-controls-dark.jpg`    | Seven remaining ordinary row controls in dark appearance                 |
| `reference/screenshots/03-remaining-controls-light.jpg`   | The same row controls in light appearance                                |
| `reference/screenshots/04-text-area-focused-dark.jpg`     | Live multiline CodeMirror editor with two lines                          |
| `reference/screenshots/05-calendar-meta-control-dark.jpg` | Calendar-mode Date meta control, selected day, and hover edit affordance |

The files retain the full product frame at original screenshot pixels so scale, canvas context,
minimap, surrounding controls, and fixture provenance remain auditable.

## Observed interaction contract

- Slider responds to arrow keys and uses the reference min/max/step configuration.
- Rotary responds to pointer, wheel, and arrow keys; one ArrowRight changed `0` to `0.1`.
- Date and time accept native-input edits; the Date calendar preset renders a live month grid.
- Password starts obscured and the labelled toggle changes between password and text presentation.
- TextArea swaps from the idle dummy to the live multiline CodeMirror editor and Escape restores
  the idle layer.
- Dropzone exposes local-file and server-file actions plus drag/drop presentation. No test upload
  was made because files and persistence belong behind the package's future host seam.
- Meta controls are headerless resizable canvas nodes: control interaction consumes its gesture;
  the remaining transparent surface is the section drag target.

## Machine-readable evidence

- [`reference/computed/meta-control-style-metrics.json`](reference/computed/meta-control-style-metrics.json)
  records the visible meta-node and descendant-control geometry, typography, color, border, radius,
  and disabled state from the dark fixture.
- [`reference/interactions/control-interaction-traces.json`](reference/interactions/control-interaction-traces.json)
  records the supervised input/result traces and the deliberately unexercised external side effect.

Frozen-source pointers used to interpret the live fixture:

- `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
- `frontend/src/components/Params/ParamUIs/SliderInput.tsx`
- `frontend/src/components/Params/ParamUIs/RotaryInput.tsx`
- `frontend/src/components/Params/ParamUIs/PasswordInput.tsx`
- `frontend/src/components/Params/ParamUIs/TextParamInput.tsx`
- `frontend/src/components/Params/ParamUIs/DropzoneInput.tsx`
- `frontend/src/components/Section/Layouts/MetaControl/MetaControlNode.tsx`
- `frontend/src/components/Section/Layouts/MetaControlArea.tsx`
- `frontend/src/state/actions/sections/createSectionsHelper.ts`
