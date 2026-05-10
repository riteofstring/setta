# TextBlock Prototype Assessment

## Functionality

- Real section type and source-of-truth files inspected:
  `internal/projectstate/frontend_section_codeobj_contracts.go`,
  `internal/projectstate/top_level_section_creation.go`,
  `internal/projectstate/text_block_sections.go`,
  `internal/projectstate/text_block_sections_test.go`,
  `frontend/src/components/Section/Layouts/TextBlock.tsx`,
  `frontend/src/components/Section/Layouts/TextBlock.test.tsx`,
  `frontend/src/components/Section/Header/SectionHeader.tsx`,
  `frontend/src/components/Section/Header/ToggleTextBlockDisplayModeButton.tsx`,
  `frontend/src/components/Section/Header/MenuButton/MenuButton.tsx`,
  `frontend/src/components/Section/Header/MenuButton/ShowMarkdown.tsx`,
  `frontend/src/components/Section/Header/MenuButton/ToggleHeadingAsSectionName.tsx`,
  `frontend/src/components/Section/Header/MenuButton/ToggleMetaControlLook.tsx`,
  `frontend/src/components/Section/Container/TextBlockMetaControlMenuButton.tsx`,
  and `frontend/src/components/Panes/UiEditor/SectionConfig/TextBlockSettings.tsx`.
- Data shown maps to real TextBlock data: section name/title, `format`,
  `textDisplayMode`, `text`, `headingAsSectionName`, `metaControlStyle`, and
  `masterFontSizePx`.
- Controls/actions: TextBlock sections expose a section menu, standard section
  controls, render/edit display mode toggle, Markdown/plaintext conversion,
  Heading as Section Name toggle, Transparent Section toggle, and Master Font
  Size range control. Rendered markdown code blocks also expose a copy-code
  button.
- Important states: Markdown versus Plaintext format, Render versus Edit display
  mode, heading-derived section-name mode on/off, transparent meta-control style
  on/off, clamped master font size from 8 to 48, rendered markdown preview,
  plain text preformatted output, and editor mode. The primary fixture uses
  Markdown Render mode with heading-as-section-name and transparent style off.
- Interactions that must stay recognizable: switching render/edit mode,
  converting Markdown/plaintext, toggling heading-derived naming, toggling
  transparent section style, adjusting master font size, scrolling rendered
  text, and copying rendered code. The prototype represents these as static
  HTML controls and a rendered markdown-like content area; it does not implement
  the editor, OpenAPI mutations, markdown parsing, KaTeX, or clipboard writes.

## Layout Invariants

- Conceptual regions and ordering: flat section titlebar first, a TextBlock
  render/edit affordance near section controls, then TextBlock-specific settings
  and rendered text content.
- Relative placement of important controls: render/edit remains close to the
  titlebar controls as in the real header; format, heading-name, transparent
  style, and font-size settings remain grouped together; rendered text remains
  the dominant body region.
- Grouping/containment relationships: text settings are grouped separately from
  the readable content. Code copy belongs to a code block inside rendered text,
  not to the generic section controls.
- Scroll or overflow expectations: rendered text is content-oriented and may
  scroll inside the section body. The prototype should be more compact than
  row-heavy Callable/Dict bodies when content is short, but still large enough
  to show settings and rendered markdown without unmapped empty space.

## Intentional Differences

- The flat prototype may replace production Tailwind typography classes,
  Markdown editor/renderer DOM, switches, Radix menus, hover-only copy behavior,
  and rounded meta-control chrome with the accepted flat shell, static semantic
  controls, subtle separators, and a static rendered text fixture.
- Production layout logic intentionally not reused: Zustand selectors,
  `MarkdownEditorInSection`, ReactMarkdown, remark/rehype plugins, CodeMirror
  wrappers, `useIsScrollable`, OpenAPI calls, debounce logic, and production
  Tailwind class chains are not copied.
- Confirmation that the prototype is not fictional and is not an old-design
  lift: every visible section-specific element is backed by the real TextBlock
  contract, mutation APIs, header/menu controls, settings controls, or render
  behavior.
- Confirmation that every visible prototype affordance maps to real section
  behavior or data: title/name, format state, display mode, rendered text,
  markdown heading/body/list/code, code copy button, heading-as-section-name
  toggle, transparent-section toggle, and master font-size range all map to
  inspected source.
- Confirmation that the required section-type label is external page/gallery
  chrome and not part of the section body, shell, titlebar, toolbar, controls,
  or reusable section layout component.
- Confirmation that Callable and Param Dict/Dict baselines will not be visibly
  changed: this task adds a new TextBlock prototype only. Any shared shell
  extension will be optional with unchanged defaults and will not alter their
  internal layout, dimensions, row hierarchy, controls, ports, fixtures, or
  visual rhythm.

## Component Plan

- New files or functions: add `FlatTextBlockSectionPrototype`,
  TextBlock-only fixture data, and TextBlock-only prototype body/header control
  helpers in `frontend/src/components/Section/Layouts/FlatSectionPrototype.tsx`.
  Add TextBlock-only CSS selectors in `FlatSectionPrototype.css` and add the
  external `TextBlock` gallery item in `FlatSectionPrototypeGallery`.
- Static fixture data: title `Review Notes`, Markdown render mode, `18px`
  master font size, heading-as-section-name off, transparent style off, and a
  rendered markdown text fixture with a heading, paragraph, checklist/list
  content, inline code, and a fenced code block.
- Tests/verification: extend
  `frontend/src/components/Section/Layouts/FlatSectionPrototype.test.tsx` to
  assert TextBlock affordances, external gallery label, content-oriented sizing,
  no ports/workflow/child-card row surfaces, and continued isolation from
  Callable and Param Dict/Dict baselines. Run focused Vitest, formatting, diff
  whitespace check, and CDP visual verification when feasible.
