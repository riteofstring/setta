# JSON sources vs artifacts: why the save path differs

- JSON-source edits update the live Go project-state document first. The source
  file on disk is only brought back in sync when the app save/autosave path
  calls `SaveJSONSourceFiles(...)` and then persists the stripped document
  (`internal/app/app.go`, `internal/projectstate/json_source_save.go`,
  `internal/projectstate/json_source_persist_cleanup.go`).
- The JSON-source watch path only reloads variants when the source file itself
  changes on disk (`internal/app/json_source_watch.go`,
  `internal/jsonsourcewatch/service.go`), so the filesystem copy is expected to
  lag behind the in-memory document until that save/autosave flush happens.
- Artifact updates are different: the artifact routes write through the Go
  artifact service immediately, so there is no analogous pending in-memory
  artifact buffer after the request returns (`internal/httpapi/artifact_routes.go`,
  `internal/artifacts/service.go`).
- Because artifacts land on disk immediately, the artifact watch/runtime can
  reload and broadcast `UpdateArtifacts` right away (`internal/app/artifact_watch.go`).
  JSON-source sections intentionally wait for the save/autosave flush so the
  file on disk catches up to the in-memory document first.
