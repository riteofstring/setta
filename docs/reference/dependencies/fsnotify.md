# fsnotify

- Module: `github.com/fsnotify/fsnotify`
- Local status: planned candidate, not yet pinned in `go.mod`
- Official package page observed on 2026-03-07: `v1.9.0`
- Official package docs: https://pkg.go.dev/github.com/fsnotify/fsnotify
- Official repo: https://github.com/fsnotify/fsnotify

## Why It Is A Candidate

- low-level filesystem notifications for project/runtime watchers
- intended only as an OS integration layer below repo-owned recursive watch,
  debounce, and coalescing logic

## API Surface To Use If Adopted

- `fsnotify.NewWatcher`
- `Watcher.Add`
- `Watcher.Remove`
- `Watcher.Close`
- `Watcher.Events`
- `Watcher.Errors`

Potentially useful later:

- `AddWith`
- `WithBufferSize`

## Usage Rules For This Repo

- never expose raw fsnotify events directly to product logic
- build a repo-owned wrapper for:
  - recursive registration
  - debounce/coalescing
  - per-project scope ownership
  - translation from noisy FS events into stable runtime refresh events

## Relevant Upstream Guidance

- package is cross-platform, but backend behavior differs by OS
- upstream docs are explicit that support is backend-dependent
- debug logging exists via `FSNOTIFY_DEBUG=1`

## Gotchas

- not recursive by default
- network filesystems and other non-native filesystems may behave poorly
- macOS/BSD `kqueue` can consume many file descriptors
- do not let platform-specific event noise leak into higher-level runtime logic
