# MetaControl Prototype Assessment

## Functionality
- Real section type and source-of-truth files inspected:
  - `internal/projectstate/frontend_section_codeobj_contracts.go` defines `FrontendSectionTypeMetaControl` and `FrontendMetaControlSectionImpl` with `metaControlParamId`, `showSectionTitle`, parameter maps, selected/pinned params, ignore-type state, and edge port fields.
  - `internal/projectstate/top_level_section_creation.go` creates top-level MetaControl sections, defaults to a `SliderParam`, stores the control param in `metaControlParamId`, and seeds `codeObjVariantMap`.
  - `internal/projectstate/change_param_impl.go` defines the allowed MetaControl control code object types.
  - `internal/projectstate/frontend_section_sizing_defaults.go` defines compact MetaControl section sizing and per-control minimums.
  - `frontend/src/components/Section/Layouts/MetaControlArea.tsx` resolves the wrapped control param, renders either a button action control or a value control, emits realtime dependency changes, and persists value changes.
  - `frontend/src/components/Section/Layouts/MetaControl/MetaControlNode.tsx` maps real control code object types to concrete control widgets.
  - `frontend/src/components/Section/Container/MetaControlMenuButton.tsx` exposes the MetaControl hover menu, editable section title, Show title toggle, lock, and close/hide actions.
  - `docs/reference/meta-controls.md` and `docs/reference/listener-flows.md` document the single-control model and realtime/persistence behavior.
- Data shown:
  - A MetaControl section wraps one `metaControlParamId`; the prototype will show one active control param rather than a row list.
  - The active fixture maps to the default real creation path: a `SliderParam` control named `temperature`.
  - The prototype will also show compact adjacent examples for other real control states: a `ButtonParam` action, `SwitchParam`, `ColorPickerParam`, `DropdownParam`, `DateParam`, `TimeParam`, and `DropzoneParam` because production supports those rendered widget surfaces and the section is defined by the selected control type.
  - `showSectionTitle` is represented as enabled for the main control, with the section title rendered as an in-section floating title label because this is a real MetaControl affordance.
  - `codeObjVariantMap`, `selectedParams`, and `pinnedParams` are represented only as quiet state chips for the active control param/variant, not as editable row regions.
- Controls/actions:
  - A hover/menu affordance maps to `MetaControlMenuButton` and its Show title, lock, and close/hide menu actions.
  - The main slider maps to `ConfiguredSliderInput` and value persistence/realtime emission.
  - The button maps to `ConfiguredButtonInput` and action events rather than persisted values.
  - Switch, color, dropdown, date, time, and dropzone samples map to the real `MetaControlContent` renderers and supported control code object types.
- Important states:
  - `showSectionTitle` on/off; the selected fixture uses on.
  - Value controls emit realtime value changes and persist via `setParamEnteredValue`.
  - Button controls emit realtime action events and do not persist a value.
  - Stateless dropzone behaves like an action event; stateful dropzone behaves like a value control. The prototype will label the sample as stateless.
  - Password controls are supported by production but will not be visualized in this first MetaControl prototype because showing secret handling would either require a dedicated password-state fixture or risk implying visible secret content.
- Interactions that must stay recognizable:
  - The section is a compact, floating control widget, not a standard parameter table.
  - The wrapped control is the primary body; configuration/menu affordances sit outside or above the control.
  - The control's state can drive listeners through the section dependency key.

## Layout Invariants
- Conceptual regions and ordering:
  - External preview label above the prototype remains page/gallery chrome.
  - The MetaControl prototype body should be compact and widget-first, matching the real section's 32px/default compact control sizing rather than the taller Callable/Dict row layout.
  - A tiny outboard menu/drag affordance appears near the section, reflecting MetaControl's hover menu and drag handle without becoming section content.
  - When `showSectionTitle` is enabled, the section title appears above the control inside the MetaControl body, matching `MetaControlTitleStack`.
  - The main active control occupies the first row; secondary supported control examples are grouped below as compact widget tiles.
- Relative placement of important controls:
  - The menu/status affordance should sit at the top edge near the control, not as a full titlebar.
  - The slider track/value should stay centered in the compact active control row.
  - Action/value/status chips should remain subordinate to the widget, not become a parameter list.
- Grouping/containment relationships:
  - All visible widgets belong to one MetaControl section prototype and represent allowed control-param render shapes.
  - The active SliderParam and the supported-control samples must be clearly grouped as control surfaces, not child sections.
- Scroll or overflow expectations:
  - The section should not scroll for the fixture; MetaControl sections are compact but can resize by control type.
  - Dropzone and text-area-like controls can require taller sizing in production; this prototype shows only compact summaries of those states to avoid unmapped empty space.

## Intentional Differences
- What the flat prototype is allowed to change:
  - Use the accepted flat prototype color, typography, and low-radius visual language.
  - Replace production Tailwind-heavy widget internals with simple static HTML/CSS controls that preserve affordance shape.
  - Show multiple supported control types in one static prototype to make the section's single-control polymorphism recognizable without creating separate fictional sections.
- What production layout logic is intentionally not reused:
  - No production DOM structure, Tailwind class chains, measurement hooks, resizable wrappers, Radix menu markup, CodeMirror, configured input components, or websocket/update handlers are reused.
  - The prototype uses static fixture HTML/CSS only.
- Confirmation that the prototype is not fictional and is not an old-design lift:
  - Every visible widget/control maps to a supported `controlCodeObjectTypes` member or a documented MetaControl menu/title behavior.
  - The prototype does not copy the old production layout; it uses a flat compact control composition.
- Confirmation that every visible prototype affordance maps to real section behavior or data:
  - Main title, hover/menu control, Show title, lock, hide/close, slider, button action, switch, color, dropdown, date/time, stateless dropzone, realtime/persist chips, and control-param metadata are all grounded in inspected owner code or docs.
- Confirmation that the required section-type label is external page/gallery chrome and not part of the section body, shell, titlebar, toolbar, controls, or reusable section layout component:
  - The gallery wrapper will render `MetaControl` above the section via `FlatPrototypeGalleryItem`; no section body label will be added to satisfy this requirement.
- Confirmation that Callable and Param Dict/Dict baselines will not be visibly changed:
  - The implementation will add MetaControl-only functions/styles/tests and gallery entries. It will not alter Callable or Dict fixtures, body structure, controls, row hierarchy, ports, or CSS.

## Component Plan
- New files or functions:
  - Add `FlatMetaControlSectionPrototype` and MetaControl fixture constants in `frontend/src/components/Section/Layouts/FlatSectionPrototype.tsx`.
  - Add MetaControl-specific CSS selectors in `frontend/src/components/Section/Layouts/FlatSectionPrototype.css`.
  - Add dark/light gallery entries labeled `MetaControl` in the preview wrapper.
- Static fixture data:
  - Active section name: `Sampling Controls`; active control param: `temperature`; type: `SliderParam`; value: `0.72`; variant: `param-temperature-v1`; show title: `true`.
  - Supported control samples: run action button, enabled switch, output color, model dropdown, run date, start time, stateless dropzone.
- Tests/verification:
  - Extend `FlatSectionPrototype.test.tsx` to assert the gallery includes `meta-control`, the prototype exposes one active wrapped param, supported real control types, title/menu/show-title/lock/hide affordances, realtime/persist/action/dropzone semantics, no row-group/list/group/state-machine markers, and no Callable/Dict contamination.
  - Run `pnpm -C frontend exec vitest run src/components/Section/Layouts/FlatSectionPrototype.test.tsx`.
  - Run formatting and `git diff --check`.
  - Run CDP visual verification against `/internal/flat-section-prototype` if the dev server is available.
