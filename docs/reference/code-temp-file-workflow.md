# Code Temp File Workflow

This note collects the current conventions around the Python files we surface to
the language server. It complements the completion queue refactor plan (now
fully implemented) and is meant to help future refactors avoid undoing the
temp-file split or bypassing the read/write lock accidentally.

## Canonical project files

- `BaseProjectManager.update` rebuilds every project under the serialized
  write lock. For each config we pick a project-specific folder underneath
  `setta_files/code/sections/<projectConfigName>/`.
- Each section that resolves to `ProjectPythonCode` writes to a canonical file
  named after `helpers_lvl2.get_section_path_full_name`, sanitized by
  `code_gen.utils.sanitize_name`. Top-level sections simply use their display
  name; nested sections append `["Child"]` or `[0]` style suffixes before
  sanitization.
- Using the earlier example with sections `X` and `Y`, the LSP sees:
  - `setta_files/code/sections/<projectConfigName>/X.py`
  - `setta_files/code/sections/<projectConfigName>/Y.py`
- Generated code lives in the same folder as `setta_gen.py`. These canonical
  files stay open with the LSP (`PythonCode.update_file` →
  `send_document_open_request`) so cross-section imports (`from .Y import fn`)
  resolve against the latest state.
- Bindings no longer expose a configurable `snapshot_dir`; the backend always
  derives snapshot locations from each canonical path’s parent directory.

## Completion snapshots

- Read-only completion routes (`code_area_completion`, `text_field_completion`,
  `gen_code_prefix_completion`, `gen_code_suffix_completion`) bypass the queue
  but still acquire the shared read lock (`BaseProjectManager.enqueue_method`).
- Instead of mutating the canonical files, `PythonCode.temporary_document`
  materializes per-request snapshots named
  `setta_files/code/sections/<projectConfigName>/<base>__<uuid>.py` for normal
  code sections. The document is opened with a fresh `didOpen`, the LSP request
  is issued, and we immediately send `didClose` and unlink the file. During
  validation, confirm the `didClose` messages appear in the LSP logs to avoid
  leaking temp state.
- Generated code completion snapshots now reuse the canonical sections folder,
  writing temporary files to
  `setta_files/code/sections/<projectConfigName>/setta_gen__<uuid>.py` so every
  snapshot follows the same import resolution rules.
- Because the snapshots reuse the same base name prefix, the LSP can import
  symbols from the permanent files while we collect completions for the
  snapshot contents.

## Generated code completions

- `ProjectGenPythonCode._clone_generator` deep copies the dependency graph,
  seeds a new `PythonCodeGenerator`, and renders code into a temporary document
  before completions are requested.
- The cloned generator isolates completion-time edits (e.g. prefix/suffix
  changes or param updates) from the real generator instance that serialized
  write paths mutate.
- `project_code.ProjectGenPythonCode._request_completion_response` uses the same
  `temporary_document` helper so every generated-code completion also operates on
  a throwaway file (`setta_gen__<uuid>.py`).

## Concurrency context

- Completion handlers run outside the manager queue to avoid blocking UI writes.
  The read lock prevents them from racing with `update`, while the snapshot
  files prevent competing writes to shared temp files. Watching for overlapping
  read-lock acquisitions in debug logging helps confirm the bypass remains
  concurrent.
- Mutating handlers (`set_code`, `set_callable`, etc.) remain serialized; they
  are the only ones that touch the canonical generator or section files.

## Quick reference

| Scenario                         | Files touched                                                     |
| -------------------------------- | ----------------------------------------------------------------- |
| Serialized updates (`set_code`)  | `setta_files/code/sections/<projectConfigName>/<Section>.py`      |
| Generated code rebuild           | `setta_files/code/sections/<projectConfigName>/setta_gen.py`      |
| Section completion request       | `.../sections/<projectConfigName>/<Section>__<uuid>.py` (temp)     |
| Generated code completion request| `.../sections/<projectConfigName>/setta_gen__<uuid>.py` (temp)      |

Keep this layout in mind when debugging LSP behaviour: if a completion resolves
imports, it is because the canonical files stayed open, not because the snapshot
persisted. When running manual smoke tests, include a quick check that the temp
snapshot directory is empty after the server stops to catch `didClose` regressions.
