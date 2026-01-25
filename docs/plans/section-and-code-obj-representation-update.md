# Section + Code Obj Representation Mode Update

## Summary
We are renaming and reshaping representation modes used by section codegen and code object value policies.
The focus is to make the names match actual behavior, split file handling into path vs read,
and keep realtime/base64 payloads separate from codegen.

## Key decisions
- Section representation modes are now:
  - `expression`: emit a Python expression.
  - `file_path`: emit a Python string literal path.
  - `file_read`: emit a file read (packaged runtime reads file contents).
- Code obj value representation modes are now:
  - `expression` (was `literal`): type-aware Python expression.
  - `string` (was `raw`): always `repr(...)` of the stored string.
  - `json_parsed` (was `json`): parse JSON and emit Python literal values.
- Chat section `expression` outputs a Python dict (via `model_dump()` + `repr`).
- `file_read` is strict: missing file paths are hard errors (no silent fallback).
- Base64 remains for realtime/listener payloads only; it is not a section representation mode.
- Backward compatibility is not required.

## Section support matrix (codegen)
- Chat: `expression`, `file_path`, `file_read`
- Draw: `file_path`, `file_read`
- Image: `file_path`, `file_read`
- Chart: `expression`, `file_path` (planned; not currently exported)
- All other exported section types: `expression`

## Default behavior
- Chat / Draw / Image default to `file_read`.
- All other sections default to `expression`.
- Code obj values default to `expression`.

## Implementation outline
- Update enums + defaults in `backend/setta/types/project_config.py`.
- Update support validation for sections and code objs.
- Store section representation on `SectionNode` and respect it in the value codec.
- Update dependency graph exporters to build values for:
  - Chat `expression` -> dict expression
  - `file_path` -> literal path string
  - `file_read` -> `FileReadDependencyValue`
- Update frontend Run Instructions dropdowns to new names + options.
- Regenerate types via `source activate.sh && cd frontend && pnpm generate`.
- Update tests and docs to reflect the new names/behavior.
