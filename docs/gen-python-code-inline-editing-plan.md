# GenPythonCode inline editing plan

## Goal
Let users edit the GenPythonCode prefix and suffix directly in the GenPythonCode CodeMirror area, while keeping the generated middle block read-only. The visual separator (blank line before the generated block and after it) is persisted into the actual code file.

## Proposed UX
- The GenPythonCode section shows a single editor with three regions:
  - Prefix (editable).
  - Generated code (read-only, visually tinted).
  - Suffix (editable).
- Always insert a persisted blank line before and after the generated block.
- Show placeholder text in empty prefix/suffix areas (e.g. "add imports here...", "add post-run code here...") without persisting the placeholder.

## Data flow and boundaries
- Use `projectConfig.genCodePrefix`, `projectConfig.genCodeSuffix`, and the current generated `code` to build a combined doc:
  - `doc = prefix + "\n" + generated + "\n" + suffix`
- Compute read-only boundaries based on prefix/suffix lengths:
  - `generatedStart = prefix.length + 1`
  - `generatedEnd = generatedStart + generated.length`
- If the generated `code` no longer matches the expected `prefix + "\n" + generated + "\n" + suffix` structure (for example, due to backend changes), fall back to fully read-only until the next state update stabilizes.

## CodeMirror strategy
- Replace `ReadOnlyCoreCodeArea` usage in `frontend/src/components/Section/Layouts/CodeArea.tsx` for GenPython with an editable CodeMirror setup.
- Use a CodeMirror `changeFilter` to block any transaction that intersects `[generatedStart, generatedEnd)`.
- Use a selection guard (transaction filter or view update listener) to keep the cursor out of the generated range when the user clicks or navigates into it.
- Apply decorations:
  - `Decoration.mark` to give the generated region a read-only visual treatment.
  - `Decoration.widget` to show placeholders at the top of the prefix region and the top of the suffix region when they are empty.

## Prefix/suffix persistence
- The persisted newlines are part of the prefix/suffix values:
  - When the user edits the combined doc, split it into prefix and suffix by slicing around the generated region and then trimming a single boundary newline to keep the separator persisted.
- Debounce updates and reuse the existing optimistic updates:
  - `route_set_gen_code_prefix` and `route_set_gen_code_suffix`.

## Completions
- Provide a completion source that routes to:
  - `route_gen_code_prefix_completion` when the cursor is in prefix.
  - `route_gen_code_suffix_completion` when the cursor is in suffix.
  - No completions inside the generated range.

## Files and components
- Primary implementation in `frontend/src/components/Section/Layouts/CodeArea.tsx`.
- Use the existing CodeMirror extension helpers in `frontend/src/components/Utils/CodeMirror/getExtensions.ts`.
- Keep `frontend/src/components/Panes/UiEditor/SectionConfig/GenPythonCodeSettings.tsx` as a fallback editor.

## Edge cases
- Prefix/suffix edits that remove the boundary newlines should reinsert them on the next render to enforce the invariant.
- If the generated code content changes due to backend updates, recompute the generated range boundaries and reapply decorations/filters.
