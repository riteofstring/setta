# Autosave Trigger After Manual Save

## Findings
- `BaseProjectManager.add_new_history_entry` always schedules a debounced autosave when state changes, leaving an autosave task pending until it executes (`backend/setta/project_state/base_project_manager.py:1137`).
- The manual save FastAPI route calls `project_manager.save()` directly, never cancelling the pending debouncer task, so an autosave queued before the manual save still fires afterward (`backend/setta/routers/projects.py:112`).
- Cancelling the debouncer inside `save()` is unsafe because autosave runs call the same method; cancelling there would interrupt legitimate autosave executions (`backend/setta/utils/async_debouncer.py:13`).

## Implementation Summary
- Added `AsyncDebouncer.cancel_pending()` and execution tracking so we can cancel only timers that have not started (`backend/setta/utils/async_debouncer.py:9-56`).
- Introduced `BaseProjectManager.perform_manual_save()` to clear pending autosaves before delegating to `save()` (`backend/setta/project_state/base_project_manager.py:1194-1197`).
- Routed manual save flows through the new helper across project manager and FastAPI endpoints (e.g., `backend/setta/project_state/project_manager.py:56`, `backend/setta/routers/projects.py:112-194`).
- Added regression coverage to assert manual saves cancel pending autosaves (`tests/project_state/test_manual_save_autosave.py`).
- Manually verified that triggering a save while autosave is enabled no longer causes a follow-up autosave notification.
