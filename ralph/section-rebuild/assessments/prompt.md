# Prompt Prototype Assessment

## Functionality
- Real section type and source-of-truth files inspected: `internal/projectstate/frontend_section_codeobj_contracts.go`, `frontend/src/components/Section/Layouts/PromptArea.tsx`, `frontend/src/components/Section/Layouts/PromptArea.test.tsx`, `frontend/src/components/Panes/UiEditor/SectionConfig/PromptSettings.tsx`, and `frontend/src/utils/promptSectionSource.ts`.
- Data shown: prompt title, linked prompt template identity, Jinja format, template source text, rendered preview text, render error text, missing variables, and prompt input values from the Prompt section contract.
- Controls/actions: Template and Preview view-mode tabs, linked-template selector affordance, Make Local Copy action for linked templates, format selector, template editor area, and read-only linked-template notice.
- Important states: local prompt source, linked prompt source, missing linked template notice, read-only state from linked/frozen/deployment rules, rendered preview fallback text, render error text, and missing variables.
- Interactions that must stay recognizable: switching between Template and Preview modes, editing template text when local/editable, viewing rendered output or render errors in preview, linking a project prompt template from settings, copying a linked template locally, and format selection when not linked.

## Layout Invariants
- Conceptual regions and ordering: a compact section shell/titlebar, a mode strip near the top, prompt source/status controls before the main text surface, and the main editor/preview content below.
- Relative placement of important controls: Template and Preview mode controls remain grouped together at the top of the Prompt body; linked-template and format settings sit near the prompt source; source text and rendered output stay visually associated with the active prompt.
- Grouping/containment relationships: linked template notice belongs with source selection/read-only state, template source belongs in an editor-like monospace region, rendered text/errors belong in a preview region, and missing/input values are status data rather than unrelated decoration.
- Scroll or overflow expectations: the template/preview text regions may scroll internally for long prompts; the section shell should stay contained without body or toolbar overflow.

## Intentional Differences
- What the flat prototype is allowed to change: the old rounded CodeMirror/settings chrome can become flat, compact HTML/CSS regions while keeping the tabbed prompt editor, source linking, format, preview, and error/status affordances recognizable.
- What production layout logic is intentionally not reused: no `PromptArea` DOM, CodeMirror component, Tailwind class chains, state hooks, debounced OpenAPI mutation paths, combobox implementation, or `useCodeAreaHeight` measurement logic will be copied.
- Confirmation that the prototype is not fictional and is not an old-design lift: all visible labels, controls, source text, render text, missing variables, and linked-template status map to the Prompt section contract or inspected Prompt UI code; styling and structure are newly composed in the flat prototype language.
- Confirmation that every visible prototype affordance maps to real section behavior or data: Template/Preview tabs map to `PromptArea`, linked template/Make Local Copy/format map to `PromptSettings`, template/rendered/error/missing/input values map to `FrontendPromptSectionImpl` and prompt UI state helpers.
- Confirmation that the required section-type label is external page/gallery chrome and not part of the section body, shell, titlebar, toolbar, controls, or reusable section layout component.
- Confirmation that Callable and Param Dict/Dict baselines will not be visibly changed.

## Component Plan
- New files or functions: add `FlatPromptSectionPrototype`, a Prompt fixture, Prompt-specific body/header affordance helpers, and Prompt CSS in the prototype surface.
- Static fixture data: a linked Jinja prompt template with concrete inputs, one missing variable, rendered preview text, and a render error string that map to the Prompt section contract.
- Tests/verification: extend `FlatSectionPrototype.test.tsx` to assert Prompt gallery labels, functional affordances, compact editor/preview layout CSS, absence of workflow handles/ports/row groups, and continued Callable/Dict isolation; run focused Vitest and visual verification on `/internal/flat-section-prototype`.
