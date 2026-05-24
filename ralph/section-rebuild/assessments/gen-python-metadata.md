# GenPythonMetadata Prototype Assessment

## Functionality
- Real section type and source-of-truth files inspected:
  - `internal/projectstate/frontend_section_codeobj_contracts.go` confirms `GenPythonMetadata` is a real frontend section type.
  - `internal/projectstate/frontend_section_variant_contracts.go` defines `FrontendGenPythonMetadataSectionImpl` as the canonical Code-shaped generated section contract.
  - `frontend/src/components/Section/Layouts/CodeArea.tsx` shows `GenPythonMetadataArea` renders only when the Python codegen target has `generateMetadata` enabled, and renders a disabled Python CodeMirror value from the `GenPythonMetadata` section's `code`.
  - `frontend/src/components/Section/Container/SectionContainer.tsx` hides the section when metadata generation is not enabled.
  - `frontend/src/components/Section/Header/SectionTitle.tsx` marks `GenPythonMetadata` titles uneditable.
  - `internal/projectstate/python_codegen.go` defines the canonical metadata file name `setta_gen_meta.py`, singleton IDs, generated metadata section name, and write-only generated metadata binding.
  - `internal/codegen/python_materializer.go` creates or removes the metadata singleton section from rendered metadata code and `GeneratedMetadataBinding`.
  - `internal/codegen/python_meta_renderer.go` and `internal/codegen/python_meta_renderer_test.go` define the generated metadata content shape: dataclass definitions, `project`, `sections`, `sections_by_id`, and final `meta = SettaGenMetadata(...)`.
- Data shown:
  - Generated section identity: `Generated Python Metadata`.
  - Canonical generated file binding: `code/sections/alpha/setta_gen_meta.py`.
  - Python language, write-only binding, manual/authoritative generated binding state, metadata enabled state, and read-only body state.
  - Representative generated metadata Python lines for project metadata, section metadata, `sections`, `sections_by_id`, and final `meta` assignment.
- Controls/actions:
  - The shared flat shell titlebar remains available as prototype shell chrome.
  - The body has no run button, entry-code toggle, terminal toggle, diagnostics control, parameter rows, ports, or workflow handles because the real metadata body is a disabled generated CodeMirror viewer and header diagnostics are only wired for `GenPythonCode`.
- Important states:
  - Metadata generation enabled renders the section and its disabled editor.
  - Metadata generation disabled hides/removes the section; the prototype represents the enabled primary state.
  - The generated metadata body is read-only.
- Interactions that must stay recognizable:
  - Code viewer focus/scroll affordance remains recognizable.
  - Generated file binding and metadata generation state remain visible as status rather than editable business controls.

## Layout Invariants
- Conceptual regions and ordering:
  - Flat shell/titlebar first, then generated metadata status, then a single Python editor region.
  - No split prefix/generated/suffix editor regions; that structure is specific to `GenPythonCode`, while `GenPythonMetadataArea` renders one disabled CodeMirror value.
- Relative placement of important controls:
  - No section-specific header action controls are added. Metadata status belongs above the editor.
  - The file binding is shown as read-only status, not as a runnable or terminal action.
- Grouping/containment relationships:
  - Generated metadata state and canonical file binding are grouped together.
  - Python metadata code lines are contained in one scrollable read-only editor body.
- Scroll or overflow expectations:
  - The editor can scroll for longer generated metadata files.
  - The compact status region should not force a large unmapped empty body; height should be code-viewer sized but smaller than the generated-code prototype with prefix/suffix/terminal regions.

## Intentional Differences
- The flat prototype may simplify CodeMirror internals into semantic HTML/CSS code lines and status chips while preserving the disabled generated viewer affordance.
- Production layout logic, CodeMirror component structure, Tailwind class chains, measurement hooks, and section container DOM are intentionally not reused.
- This prototype is not fictional and is not an old-design lift: every visible affordance maps to the generated metadata section contract, metadata codegen target state, generated binding, or metadata renderer output.
- Every visible prototype affordance maps to real section behavior or data:
  - `metadata enabled` maps to `generateMetadata`.
  - `setta_gen_meta.py` maps to `GeneratedPythonMetadataFileName` and `GeneratedMetadataBinding`.
  - `write_only` maps to generated metadata `CodeFileBinding`.
  - `read-only` maps to the disabled `GenPythonMetadataArea` editor.
  - Dataclass/project/section map lines map to the metadata renderer output.
  - Absence of run/terminal/diagnostics/ports/workflow controls maps to production behavior.
- The required section-type label is external page/gallery chrome and not part of the section body, shell, titlebar, toolbar, controls, or reusable section layout component.
- Callable and Param Dict/Dict baselines will not be visibly changed.

## Component Plan
- New files or functions:
  - Add a `FlatGenPythonMetadataSectionPrototype` export in `frontend/src/components/Section/Layouts/FlatSectionPrototype.tsx`.
  - Add metadata-specific fixture data and body renderer in the prototype file.
  - Add metadata-specific CSS sizing/classes in `FlatSectionPrototype.css`.
  - Add dark/light gallery entries with the external `GenPythonMetadata` label.
- Static fixture data:
  - Use an enabled generated metadata fixture with `code/sections/alpha/setta_gen_meta.py`, `write_only`, Python language, no attached terminal, and representative metadata renderer lines.
- Tests/verification:
  - Extend `FlatSectionPrototype.test.tsx` to cover metadata shell/gallery labels, generated metadata status, read-only single editor, rendered metadata code lines, and absence of `GenPythonCode`-only run/entry/terminal/diagnostic actions.
  - Run focused Vitest for `FlatSectionPrototype.test.tsx`.
  - Run CDP visual verification for the new dark/light metadata renders when feasible.
