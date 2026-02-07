# Project Backups Default + Restore CLI

## Goals
- Turn **project auto-backups on by default** for new installs / missing settings.
- Add a **simple CLI** to list backups and restore a chosen backup onto
  `setta_files/project.json`.
- Make restore safe by default (avoid silently restoring while a Setta session is
  running and can overwrite the restored file).

## Non-goals
- A frontend backup browser UI (can be added later using the same primitives).
- A server-side restore endpoint (CLI will operate on local files).
- Changing the on-disk backup format or migrating existing backups.

## Behavior After This Change (Feb 2026)
- Auto-backups are controlled by settings:
  - `settings.backend.autobackup` (defaults to `true`)
  - `settings.backend.autobackupFreq` (seconds, default `300`)
  - `settings.backend.autobackupKeepLastN` (default `10`)
- Backups are created during project saves via:
  - `backend/setta/project_state/session_project_manager.py` calling
    `backend/setta/database/backup.py:maybe_create_backup(...)`
- Backup files are stored under `setta_files/backups/` (`C.DB_BACKUP_FOLDER`).
- Backup filenames match `backup_<timestamp>.json` and are a byte-for-byte copy
  of `setta_files/project.json`.

## Design

### 1) Default auto-backup = ON
- Update `SettingsBackend.autobackup` default from `False` -> `True`.
- Regenerate frontend settings schema/types so the UI default matches.

### 2) CLI: `setta backups ...`
Add a new CLI command group to `setta`:

#### `setta backups list`
- Shows backups in descending timestamp order (most recent first).
- Defaults to a human-readable table-ish output.
- Optional `--json` emits machine-readable JSON:
  - `[{ "index": 1, "path": "...", "timestamp": "..." }, ...]`

#### `setta backups restore`
Restores a chosen backup by overwriting `setta_files/project.json`.

Selection options (exactly one required):
- `--latest`: restore newest backup
- `--index N`: restore the Nth item from `backups list` (1-based)
- `--path /.../backup_....json`: restore a specific file

Safety rules:
- By default, refuse to restore if there is an active Setta session for the
  current workspace (detected via `SessionRegistry.find_sessions_by_workspace`).
- Provide `--force` to bypass the active-session check.
- Before overwriting `project.json`, create a “stash” copy of the current
  `project.json` into the backups dir using a distinct prefix (so we never lose
  the current state if the restore was a mistake).

User messaging:
- Print the selected backup path and the created stash path.
- Print a clear follow-up: restart the running Setta backend after restore (or
  stop it before restoring).

## Implementation Steps
1. Flip default:
   - `backend/setta/types/settings_state.py`: `SettingsBackend.autobackup = True`.
2. Regenerate frontend types:
   - `source activate.sh && cd frontend && pnpm generate`
   - Ensure `frontend/src/utils/generatedTypes.ts` reflects `.default(true)` for
     `autobackup`.
3. Add CLI commands:
   - Implement a new click group `backups` in `backend/setta/start.py`.
   - Reuse `backend/setta/database/backup.py:get_backup_files(...)` for listing.
   - Implement restore logic using `DBE.copy(...)` to overwrite `project.json`.
   - Add active-session guard via `SessionRegistry`.
4. Tests:
   - Unit test that `SettingsBackend().autobackup is True`.
   - CLI tests using `click.testing.CliRunner`:
     - `backups list` returns sorted items for a temp backups dir.
     - `backups restore --latest` replaces `project.json` and creates a stash
       file.
     - `backups restore` refuses when a session exists (unless `--force`).
5. Verification:
   - Run backend pytest suite (at least `tests/start/*` and the new tests).
   - Spot-check `pnpm generate` output diff for the settings default.

## Follow-ups (Optional)
- Add `setta backups create` for manual snapshots (calls `create_backup`).
- Add a small UI surface in Settings to explain backup location and restore CLI.
