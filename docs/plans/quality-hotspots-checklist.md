# Quality Hotspots Checklist

Based on:

```bash
./report_quality_hotspots.sh --top 20 --go-min 12 --python-min 10 --frontend-min 10
```

Fix soon:

- [x] Split `app.New` in `internal/app/app.go` into smaller setup/build helpers.
- [x] Break `Project.Normalized` in `internal/projectstate/project_graph.go` into focused normalization helpers.
- [x] Split `(*SendService).StartChat` in `internal/externalagents/send.go` into validation, config resolution, preflight, and run-setup helpers.
- [x] Replace the large type/field switch in `normalizeParamImplConfigPatch` in `internal/projectstate/update_param_impl_config.go` with per-param-type normalizers.
- [ ] Refactor `backend/setta/api/listener.py` so `_handle_realtime_event` and `_parse_websocket_payload` delegate to smaller helpers.
- [ ] Break `ChatInput` in `frontend/src/components/Chat/ChatInput.tsx` into smaller hooks and subcomponents.
- [ ] Split `FileBrowserSpreadsheetEditor` in `frontend/src/components/Panes/Overview/FileBrowser/FileBrowserSpreadsheetEditor.tsx` into smaller load/save/grid state helpers.
- [ ] Break `ProjectChatSkillsMcpViewer` in `frontend/src/components/Panes/Overview/ProjectLevelAI/ProjectChatSkillsMcpViewer.tsx` into smaller panels/hooks.
- [ ] Replace the large renderer switch in `AppParamUI` in `frontend/src/components/App/appRegistry.tsx` with per-param renderer components or a dispatch map.
