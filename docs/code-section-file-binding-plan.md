# Code Section File Binding Plan

## Goals
- Give every code section (Python or Bash) a durable file path on disk, eliminating manager-owned temp files.
- Preserve parallel LSP operations by continuing to use UUID-scoped snapshot documents.
- Prepare section metadata so we can add read/write syncing without touching queue or LSP plumbing again.

## Key Concepts
- **CodeFileBinding**: metadata attached to a code section (likely stored on the section impl) with:
  - `canonical_path`: absolute path to the section’s real file.
  - `snapshot_dir`: directory where LSP snapshot files should live.
  - `access_mode`: enum such as `read_only`, `read_write`, `write_only` (generated code).
- **Snapshot Documents**: the existing `temporary_document` helper now writes into `snapshot_dir`, keeping UUID filenames and auto-cleanup.

## Refactor Steps
1. **Add Binding Metadata**
   - Extend the section impl schema to hold a `CodeFileBinding`.
   - Default canonical paths to whatever real layout we choose (e.g. derived from project config or user settings).
   - Default `snapshot_dir` to the canonical file’s parent so relative imports keep working; generated code can keep using a dedicated temp folder.
2. **Update Code Objects**
   - Pass the binding into `ProjectPythonCode` / `ProjectBashCode`.
   - Swap `get_base_filename`, `update_file`, and `write_to_folder` to use `binding.canonical_path`.
   - Update `temporary_document` to create UUID files under `binding.snapshot_dir`.
3. **Simplify Manager**
   - Remove `used_files` and `delete_unused_files` from `BaseProjectManager`.
   - Ensure `create_project_code` forwards the binding from project state when instantiating section code objects.
4. **Generated Code**
   - Provide a binding for generated code sections with `access_mode=write_only`, a durable canonical path, and a temp-only `snapshot_dir`.
5. **Follow-Up Hooks**
   - Once bindings exist everywhere, wire file watchers and syncing logic off `canonical_path`.
   - Add UI flows for changing bindings (e.g. choosing an existing file, toggling read/write mode).

## Result
- Canonical files always live where the user expects.
- LSP keeps using temporary snapshots, so completion/signature help stays parallel to queued state changes.
- The project manager no longer owns a temp hierarchy, paving the way for true read/write syncing later.
