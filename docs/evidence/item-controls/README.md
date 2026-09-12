# Item-controls frozen-reference evidence

This bundle is the supervised pre-implementation evidence required by the approved
"Item-controls milestone — built-in parameter editing controls" amendment. It records the frozen
Setta reference at `043d3b2e9c69caf99d1246f1408b3ad7194b7864`; it is not package-output
acceptance and does not waive the milestone's later live comparison gate.

## Provenance and fixture

- Reference worktree: `../setta-main`, verified at the frozen commit above and never edited.
- Reference URL: `http://127.0.0.1:3000/sliding_peak`; supplementary settings URL:
  `http://127.0.0.1:3000/settings`.
- Browser viewport: 1512 x 805 CSS px; device pixel ratio: 2.
- Appearance: changed through Setta's **Edit → Color mode** product control.
- Workspace transform during the isolated control captures:
  `matrix(2.05904, 0, 0, 2.05904, 386.682, 83.8807)`.
- The temporary `sliding_peak` project contained one selected Dict section named
  `Control evidence`. Its five rows exercised `TextParam`, `SwitchParam`, `DropdownParam`,
  `ColorPickerParam`, and a second text-like row for name editing. Dropdown choices were Alpha,
  Beta, and Gamma; color choices were Red `#ef4444`, Green `#22c55e`, and Blue `#3b82f6`.
- The temporary project was removed after capture. The screenshots and computed observations are
  the reproducible record; no fixture application code was added to the frozen worktree.

The earlier Phase 0 settings metrics remain authoritative for idle authored dimensions:
[`../phase0/reference/computed/settings-style-metrics.json`](../phase0/reference/computed/settings-style-metrics.json).
The new metrics add focused/open/error states and the narrow fixture geometry without replacing
that source.

## Screenshot index

| File                                                        | Recorded state                                                                          |
| ----------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `reference/screenshots/00-controls-idle-dark-full.jpg`      | Full dark provenance frame for the isolated fixture                                     |
| `reference/screenshots/01-controls-idle-dark.png`           | Dark idle composite: text, checked switch, empty dropdown, color trigger, editable name |
| `reference/screenshots/02-text-focused-dark.png`            | Dark idle-to-live CodeMirror swap with wrapped value and blue focus divider             |
| `reference/screenshots/03-dropdown-open-dark.png`           | Dark open dropdown with portaled list                                                   |
| `reference/screenshots/04-dropdown-search-dark.png`         | Dark dropdown filtered from three choices to Gamma                                      |
| `reference/screenshots/05-switch-hover-dark.png`            | Dark checked-switch hover                                                               |
| `reference/screenshots/06-switch-off-dark.png`              | Dark unchecked switch after a real toggle                                               |
| `reference/screenshots/07-color-open-dark.png`              | Dark color trigger and open Red/Green/Blue popover                                      |
| `reference/screenshots/08-name-duplicate-error-dark.png`    | Dark live name editor with duplicate-name underline and error bubble                    |
| `reference/screenshots/10-settings-controls-dark-full.jpg`  | Full dark `/settings` provenance frame                                                  |
| `reference/screenshots/10-settings-controls-dark.png`       | Dark settings controls at the authoritative settings scale                              |
| `reference/screenshots/11-settings-controls-light-full.jpg` | Full light `/settings` provenance frame                                                 |
| `reference/screenshots/11-settings-controls-light.png`      | Light settings controls at the authoritative settings scale                             |
| `reference/screenshots/12-controls-idle-light-full.jpg`     | Full light provenance frame for the isolated fixture                                    |
| `reference/screenshots/12-controls-idle-light.png`          | Light idle composite                                                                    |
| `reference/screenshots/13-text-focused-light.png`           | Light live CodeMirror focus state                                                       |
| `reference/screenshots/14-dropdown-open-light.png`          | Light open dropdown                                                                     |
| `reference/screenshots/15-color-open-light.png`             | Light open color popover with Green selected                                            |
| `reference/screenshots/16-switch-hover-light.png`           | Light unchecked-switch hover                                                            |
| `reference/screenshots/17-name-duplicate-error-light.png`   | Light duplicate-name validation state                                                   |

The cropped files retain original screenshot pixels. Full frames are retained for the two idle
fixtures and both `/settings` appearances so the crop location and surrounding product state stay
auditable.

## State conclusions

- Text uses the accepted 12/16 px monospace dummy presentation, then swaps to a real CodeMirror
  `.cm-content` on activation. Escape restores the dummy layer without starting a section drag.
- The switch is a 34.3906 x 16.3907 px authored Radix control with 3.2 px padding and a 10 px
  thumb. Checked dark paint is `rgb(29, 78, 216)`; the thumb translates 16 px.
- Dropdown focus keeps the pill geometry, adds the two-pixel blue focus shadow, and opens a
  separately positioned 6 px-radius list. Search is live and keyboard selection commits once.
- The configured color path opens a separate listbox of 16 px round swatches. The no-choice path
  remains the native color input recorded in the authoritative Phase 0 settings metrics and
  frozen source.
- A duplicate item name is blocked while editing. It paints the editor red and shows the exact
  message `Param name "enabled" already exists under this parent.` in a 10 px error bubble.
- Reference disabledness is interaction-first rather than a blanket opacity treatment.
  `resolveParamUIDisabled` combines param-select mode, frozen state, permissions, and deployment
  state; it passes `disabled`/`isDisabled` into the four controls. The same idle captures are the
  visual reference because the slice adds no general disabled opacity. Text removes its editable
  cursor/selection affordance and the focus divider is suppressed during param-select mode. This
  source-backed disabled trace is recorded in the metrics and interaction manifest rather than
  fabricating a visually different state.

## Machine-readable evidence

- [`reference/computed/control-style-metrics.json`](reference/computed/control-style-metrics.json)
  records computed geometry, typography, colors, borders, radii, focused/open states, error
  treatment, and the disabled-state resolution.
- [`reference/interactions/control-interaction-traces.json`](reference/interactions/control-interaction-traces.json)
  records the observed input/result sequence for text editing, switch toggle, dropdown
  open/filter/select, color selection, name editing, and disabledness.

Frozen-source pointers used to interpret the live states:

- `frontend/src/components/Params/ParamUIs/ParamUI.tsx`
- `frontend/src/components/Params/ParamUIs/TextParamInput.tsx`
- `frontend/src/components/Params/ParamUIs/ConfiguredParamInputs.tsx`
- `frontend/src/components/Params/ParamUIs/ColorPickerInput.tsx`
- `frontend/src/components/Params/ParamItems/ParamNameInput.tsx`
