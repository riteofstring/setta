# IFrame Prototype Assessment

## Functionality
- Real section type and source-of-truth files inspected:
  - `internal/projectstate/frontend_section_codeobj_contracts.go` defines `IFrame` as a real frontend section type and `FrontendIFrameSectionImpl` with base section fields plus `code`.
  - `internal/projectstate/top_level_section_creation.go`, `internal/projectstate/frontend_defaults.go`, `internal/projectstate/auto_layout.go`, and generated `frontend/src/utils/generatedTypes.ts` define creation/default behavior, including an empty `code` default and a compact default size.
  - `frontend/src/components/Section/Container/SectionContainerCoreResizabe.tsx` routes `SectionTypeEnum.IFrame` to `IframeArea`.
  - `frontend/src/components/Section/Layouts/IframeArea.tsx` renders persisted iframe HTML only when code is non-empty and valid, suppresses non-iframe or unsafe event/script markup, and uses `ResizeObserver` to make the contained iframe match the section body size.
  - `frontend/src/components/Panes/UiEditor/SectionConfig/IframeSettings.tsx` owns the textarea for iframe HTML and rejects non-iframe input before mutating the section impl.
  - `frontend/src/components/Section/Header/HeaderIcon.tsx` identifies IFrame with the code-slash section icon.
- Data shown:
  - Section title/type, persisted iframe code presence, iframe `src`, iframe `title`, validation state, resize-to-container behavior, and the rendered embedded iframe viewport.
  - The fixture uses a valid persisted iframe code string so the body can show the normal rendered state rather than the empty/invalid suppressed state.
- Controls/actions:
  - Standard section shell controls remain available through the flat prototype shell.
  - No section-body run controls, row controls, ports, workflow handles, media import buttons, or editor toolbar controls belong to IFrame.
  - The iframe HTML textarea and validation error are settings-pane affordances, not body controls; the prototype represents that state as compact source/validation metadata and a rendered iframe viewport.
- Important states:
  - Valid iframe code renders an iframe.
  - Empty or invalid code renders no iframe in the production body.
  - Unsafe script-event attributes are rejected by the layout validation path.
  - The iframe resizes with the section body.
- Interactions that must stay recognizable:
  - Persisted iframe HTML drives the body content, the section shows the embedded page rather than an editor, invalid markup is suppressed, and resizing the section resizes the iframe viewport.

## Layout Invariants
- Conceptual regions and ordering:
  - External preview/gallery section-type label above the prototype.
  - Shared flat section titlebar first.
  - A compact source/status strip may precede the embed because it maps to persisted code, validation, and resize behavior.
  - The rendered iframe viewport is the dominant body region.
- Relative placement of important controls:
  - Standard shell controls stay in the titlebar.
  - IFrame-specific status remains secondary to the embedded viewport.
  - There are no IFrame-specific body buttons or port rows.
- Grouping/containment relationships:
  - The iframe preview is one contained embed surface, not nested cards or row groups.
  - Source metadata and validation state are grouped together, separate from the viewport.
  - Settings-pane editing is not represented as an in-section editor.
- Scroll or overflow expectations:
  - The section body should not overflow.
  - The iframe viewport fills the available preview area and clips its contained document.

## Intentional Differences
- The flat prototype may use static `srcDoc` iframe content while exposing the persisted fixture code/source metadata through data attributes, so visual verification is deterministic and does not depend on a remote site.
- Production layout logic intentionally not reused: no `IframeArea` DOM, `dangerouslySetInnerHTML`, `ResizeObserver` wiring, Tailwind class chains, settings-pane DOM, or production section container structure is copied.
- The prototype is not fictional and is not an old-design lift: every visible IFrame-specific element maps to the real `code` field, iframe validation behavior, resize behavior, or rendered iframe body.
- Every visible prototype affordance maps to real section behavior or data: title/type, code-backed source URL, iframe title, valid/suppressed status, container-fit behavior, and rendered iframe viewport.
- The required section-type label is external page/gallery chrome and not part of the section body, shell, titlebar, toolbar, controls, or reusable section layout component.
- Callable and Param Dict/Dict baselines will not be visibly changed.

## Component Plan
- New files or functions:
  - Add `iframe` to `FlatSectionKind` and the prototype icon mapping.
  - Add an IFrame fixture, `FlatIFrameBody`, and `FlatIFrameSectionPrototype` in `frontend/src/components/Section/Layouts/FlatSectionPrototype.tsx`.
  - Add IFrame-specific CSS in `FlatSectionPrototype.css`.
  - Add dark/light gallery entries with the external `IFrame` label.
- Static fixture data:
  - Title `Example Embed`, persisted code `<iframe src='https://example.com/embed' title='demo'></iframe>` from the owner layout test shape, source URL, iframe title, valid state, and container-fit resize state.
- Tests/verification:
  - Extend `FlatSectionPrototype.test.tsx` to include IFrame in gallery counts/labels and verify IFrame-specific markup, absence of unrelated row/port/workflow/run/editor/media controls, and protected Callable/Dict isolation.
  - Add a CSS guard that IFrame stays compact and embed-oriented with a contained iframe viewport.
  - Run focused Vitest for `FlatSectionPrototype.test.tsx`, formatting checks, `git diff --check`, and CDP visual verification of `/internal/flat-section-prototype` when feasible.
