1. Medium - Text-block font-size control uses the wrong capability gate
- Example: `frontend/src/components/Panes/UiEditor/SectionConfig/TextBlockSettings.tsx:41` only reads `canEditParams`, then reuses it for font-size updates at `frontend/src/components/Panes/UiEditor/SectionConfig/TextBlockSettings.tsx:117` and slider disable state at `frontend/src/components/Panes/UiEditor/SectionConfig/TextBlockSettings.tsx:221`. The backend route for this action is layout-guarded at `backend/setta/routers/project_manager.py:1164`.
- Proposed fix: Gate `masterFontSizePx` edits with `canEditLayout` (or an equivalent layout-specific flag), not `canEditParams`.
- UX before: In share/deployment sessions with param edits allowed but layout edits denied, the slider appears editable, then the write gets rejected (403), causing confusing no-op/rollback behavior.
- UX after: Slider is disabled when layout writes are forbidden; no false affordance.
- DX before: Extra failed requests + optimistic rollback noise when debugging share-policy behavior.
- DX after: Frontend permissions match backend enforcement.

2. Low-Medium - Spreadsheet file rebind keeps stale `activeSheet` state that is not consumed by the editor
- Example: Rebinding file path preserves prior `activeSheet` at `frontend/src/components/Section/Layouts/SpreadsheetArea.tsx:76` and `frontend/src/components/Section/Layouts/SpreadsheetArea.tsx:86`. The editor component does not accept/consume `activeSheet` (`frontend/src/components/Panes/Overview/FileBrowser/FileBrowserSpreadsheetEditor.tsx:483`).
- Proposed fix: On file-path change, reset `activeSheet` to `null` unless/until sheet selection is actually wired through the editor.
- UX before: Hidden stale sheet metadata can carry across file changes (potentially surfacing as wrong sheet behavior when sheet-selection support is expanded).
- UX after: File rebinding always starts from a clean, deterministic sheet state.
- DX before: State shape implies behavior that is currently not implemented.
- DX after: Cleaner contract and less latent maintenance debt.

3. Low - Calendar single-date summary ignores configured date display format
- Example: `DateCalendarInput` emits ISO directly (`summaryText = selectedDates[0]`) at `frontend/src/components/Params/ParamUIs/TextParamInput.tsx:600`, even when `dateDisplayFormat` is US/EU/long.
- Proposed fix: Format that summary via `formatDateForDisplay(selectedDates[0], dateDisplayFormat)`.
- UX before: Date format selector and summary text can disagree (e.g., US format selected, ISO shown in summary).
- UX after: Calendar summary consistently reflects the chosen display format.
- DX before: Harder to reason about whether formatting bugs are data vs presentation.
- DX after: One consistent formatting path.

Overall
- The branch direction and architecture are coherent, and I did not spot new backward-compatibility shims in the added code.
- Merge risk is mainly item 1 if share/deployment policies with split param/layout permissions matter for your rollout.
