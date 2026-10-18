# Setta local backend

Small Go packages for browser interfaces backed by local files and native processes, usable
independently of the React workspace.

```sh
go get github.com/riteofstring/setta/packages/local-backend@v0.1.0
```

Requires Go 1.26.9 or newer. Before the first module tag is published, develop against the checked-out
module with a local `go mod edit -replace` pointing to `packages/local-backend`. The release tag for
this nested module is `packages/local-backend/v0.1.0`.

| Package                   | Responsibility                                                                                 |
| ------------------------- | ---------------------------------------------------------------------------------------------- |
| `localweb`                | IPv4 loopback listening, exact Host/Origin checks, static SPA assets, bounded server shutdown. |
| `projectfs`               | Confined regular-file reads, bounded writes, atomic replacement, advisory project locks.       |
| `latestvalue`             | Initial-current subscriptions and coalesced latest-value updates, without blocking publishers. |
| `revisionstore`           | One durable JSON state file with revision checks, cross-process locking, and live updates.     |
| `strictjson` / `httpjson` | Strict bounded JSON decoding and HTTP response/method helpers.                                 |
| `sse`                     | JSON server-sent event framing and request-scoped streaming.                                   |
| `artifacthttp`            | Passive artifact responses with preview/download headers.                                      |
| `proctree`                | Platform-specific descendant containment and bounded process cleanup.                          |

## A local server

This complete example serves one endpoint. For a built frontend, open its production directory with
`localweb.OpenAssets`, combine it with your API via `assets.Handler(api)`, then wrap that handler with
`localweb.SecureHandler` in the same way.

```go
package main

import (
    "context"
    "fmt"
    "log"
    "net/http"
    "os"
    "os/signal"

    "github.com/riteofstring/setta/packages/local-backend/localweb"
)

func main() {
    ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt)
    defer stop()
    listener, err := localweb.Listen(0)
    if err != nil { log.Fatal(err) }
    defer listener.Close()
    handler, err := localweb.SecureHandler(listener, http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
        fmt.Fprintln(w, "Hello from Setta")
    }))
    if err != nil { log.Fatal(err) }
    address, err := localweb.URL(listener)
    if err != nil { log.Fatal(err) }
    fmt.Println(address)
    if err := localweb.Serve(ctx, listener, handler); err != nil { log.Fatal(err) }
}
```

`Listen` binds only to `127.0.0.1`. `SecureHandler` is a separate, required composition step for the
Host/Origin admission and response headers; `Serve` owns serving and bounded shutdown. The app owns
its routes, authorization, validation, and error responses. Loopback hosting does not sandbox
executed code or protect against other programs running as the same OS user.

## Project files and updates

Open a `projectfs.Root` for each project, close it when the project closes, and use relative paths.
`ReadRegular(path, maxBytes)` bounds reads; `WriteExclusive` creates without overwriting;
`Replace` stages and atomically replaces a regular file. `WithLock` serializes a caller-defined
operation with context cancellation. Symlink traversal and irregular files are rejected.
Multi-file transactions and project schemas remain application-owned.

For live state, create a `latestvalue.Publisher` with the initial snapshot and an application-owned
clone function. Subscriptions immediately receive the current detached snapshot; slow subscribers
receive the newest value instead of an unbounded queue. Pass a subscription to `sse.Serve` for a
browser EventSource endpoint. Do not use latest-value publication when every event must be retained.

## Revisioned state

`revisionstore.Open(root, revisionstore.Options[T]{Path, Initial, Validate, MaxBytes})` keeps one
JSON state file under a `projectfs.Root`, creating it from `Initial` at revision 0. `Replace(expected,
value)` succeeds only when the file is still at `expected`, then writes revision `expected+1`
atomically under an advisory lock, so two processes or tabs cannot silently overwrite each other.
A stale writer receives `ErrRevisionConflict` and the store refreshes to the durable state.
`Subscribe` delivers the current snapshot and later revisions through `latestvalue`. `Validate`
runs on every load and replacement; the caller keeps the root open for the store's lifetime.

```go
type Notes struct {
    Items []string `json:"items"`
}

store, err := revisionstore.Open(root, revisionstore.Options[Notes]{
    Path:     ".local/notes/state.json",
    Initial:  Notes{Items: []string{}},
    MaxBytes: 1 << 20,
})
if err != nil { return err }
defer store.Close()
current, err := store.Snapshot()
if err != nil { return err }
next, err := store.Replace(current.Revision, Notes{Items: append(current.Value.Items, "milk")})
switch {
case errors.Is(err, revisionstore.ErrRevisionConflict):
    // Another writer won; reload with store.Snapshot() and let the user retry.
case err != nil:
    return err
default:
    log.Printf("saved revision %d", next.Revision)
}
```

See the [design rationale](../../docs/design/local-backend.md) for boundaries and invariants.
Licensed under [Apache-2.0](LICENSE).
