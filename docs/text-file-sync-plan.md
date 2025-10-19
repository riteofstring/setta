# Text File Sync Plan

## Current State
- Regular code sections persist their text solely in project state; every refresh rebuilds the `ProjectPythonCode` helper and writes to `setta_files/code/temp_folder/<project>/<sanitized>.py` without ever reading from user-authored files (`backend/setta/project_state/base_project_manager.py` lines 481-550, `backend/setta/project_state/project_code.py` lines 302-351).
- The generic `Code` helper always targets the temp folder so the “real” write path is disconnected from disk (`backend/setta/project_state/code.py` lines 34-62).
- The frontend now exposes basic path/sync controls, but they only store metadata—no backend writes to the chosen path occur yet, and disk changes remain invisible (`frontend/src/components/Section/Layouts/CodeArea.tsx` lines 120-320).
- Two-way disk sync already exists for JSON-source sections and artifacts via `SpecificFileWatcher`; both maintain per-path metadata, map external writes back into state, and broadcast updates (`backend/setta/project_state/jsonSource/jsonSource.py` lines 95-179, `backend/setta/project_state/artifacts.py` lines 74-210).

## Proposed Direction
- Extend `BaseCodeSectionImpl` (and future text editors) with `filePath: str | None`, `syncMode: Literal["project","twoWay"]`, and `fileMissing: bool` so variants know which file they own while leaving generated code in `project` mode.
- Introduce a `TextFileSync` service alongside `Artifacts`/`JSONSource` to manage watchers: maintain `path → {projectConfigId, sectionId, variantId}` mappings, cache hashes through `DBE`, and raise notifications when changes arrive; wire it via a new `watch_text_files` hook in `BaseProjectManager` after code helpers are rebuilt.
- On `set_code`, update the Pydantic state, mark the file metadata dirty, and write to both the temp LSP file and the real file when `syncMode == "twoWay"`, using hashes to ignore our own writes.
- When watcher callbacks fire, compare hashes to detect true external edits, refresh `impl.code`, set `fileMissing` when reads fail, and broadcast the single-config state through the existing queue.
- Surface path configuration in the UI (choose file, show sync status/last updated, gate edits for missing files); the same abstraction can power future Markdown/Text sections by swapping the editor surface.
- Optionally support conflict strategies (`skip`, `backup`, `overwrite`) mirroring artifact saves so users can opt into backups on simultaneous edits.

## Progress
- Added a logging-only `TextFileSync` prototype with explicit `register_sections`/`watch_text_files` hooks and shared it across all `BaseProjectManager` instances via `server_state`.
- Refactored `BaseProjectManager.update` to emit `SectionCodeHelperMetadata`, cache helper instances per project config, and centralize registration of text sections.
- Replaced the loose tuple wiring with a shared `TextSectionBinding` dataclass consumed by `TextFileSync.register_sections`, tightening the interface ahead of two-way sync logic.
- Extended code section models, helpers, and generated schemas with `filePath`, `syncMode`, and `fileMissing`, and plumbed the values through `SetCodeRequest`.
- Added a temporary CodeArea control surface so users can enter a file path, toggle sync mode, and view a missing-file badge while the backend stores the metadata.

## Open Questions
- How should paths be entered—absolute, relative to the project root, or constrained to a workspace whitelist—and do we need templating per project config?
- Do we allow multiple variants to bind to the same file, and if so how are simultaneous writes arbitrated?
- Can the LSP operate on the true file path for better tooling, or do we keep temp files to avoid breaking rename refactors?

## Next Steps
1. Teach `set_code` to write through to the configured path when `syncMode == "twoWay"` and store per-path hashes so self-writes can be ignored.
2. Activate `TextFileSync.watch_text_files` to subscribe to disk events, reload section code on external changes, and flag `fileMissing` when reads fail.
3. Harden the frontend UX (status badges, conflict toasts, manual resync) and add automated coverage for the metadata and watcher flow.
