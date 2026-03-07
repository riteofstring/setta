## 1. Recommended stack summary

| subsystem                                   | recommended library/package                                                            | purpose                                                                            | confidence | build-vs-buy recommendation |
| ------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- | ---------- | --------------------------- |
| HTTP routing & middleware                   | `go-chi/chi` on top of `net/http`                                                      | Route tree, middleware, subrouters, keeps handlers in stdlib form                  | high       | use library                 |
| Core HTTP primitives                        | `net/http`, `encoding/json`, `context`                                                 | Server, cookies, request context, uploads/downloads, JSON APIs                     | high       | stdlib                      |
| WebSocket transport                         | `github.com/coder/websocket`                                                           | Actual WebSocket protocol handling                                                 | high       | use library                 |
| SSE / streamed HTTP                         | `net/http` (`ResponseController` / `Flusher`)                                          | SSE endpoints and streamed MCP HTTP responses                                      | high       | stdlib                      |
| Cookie signing                              | `gorilla/securecookie`                                                                 | Signed and optionally encrypted cookie payloads                                    | medium     | use library                 |
| Auth/session semantics                      | custom                                                                                 | Bootstrap token exchange, share-session mode, session lifecycle/rules              | high       | write ourselves             |
| Concurrency helpers                         | goroutines + `context` + `x/sync/errgroup` + `singleflight`                            | Cancellation, fan-out/fan-in, dedupe, background task coordination                 | high       | use library                 |
| Runtime managers / registries               | custom                                                                                 | Per-project/per-session long-lived state, watchers, refresh orchestration          | high       | write ourselves             |
| File-backed state                           | `os`, `io/fs`, `filepath`, custom layout + atomic-write helper                         | Durable workspace/app-state storage                                                | high       | write ourselves             |
| JSON Schema                                 | `santhosh-tekuri/jsonschema/v6`                                                        | Validate schemas and JSON payloads                                                 | high       | use library                 |
| MCP server/client                           | `modelcontextprotocol/go-sdk`                                                          | MCP server + MCP client + stdio/HTTP/SSE transports                                | medium     | use library                 |
| LLM provider adapters                       | Official provider SDKs only at the edge                                                | Provider auth/transport/streaming clients                                          | medium     | use library                 |
| LLM/chat orchestration                      | custom                                                                                 | Conversation state, tool orchestration, model routing, retries, streaming behavior | high       | write ourselves             |
| Subprocess orchestration                    | `os/exec` + `errgroup`                                                                 | Spawn, supervise, cancel, restart, capture stdio                                   | high       | stdlib                      |
| PTY terminals                               | `aymanbagabas/go-pty` + `golang.org/x/term`                                            | Cross-platform PTY/ConPTY + terminal raw mode/resize                               | medium     | use library                 |
| LSP client/session layer                    | custom adapter; optionally `sourcegraph/jsonrpc2` inside it                            | JSON-RPC framing and LSP session glue over stdio                                   | medium     | write ourselves             |
| File watching                               | `fsnotify` + custom recursive/debounce layer                                           | Filesystem notifications                                                           | high       | use library                 |
| Plugins / extensibility                     | custom manifest + subprocess/MCP boundary                                              | Discovery, compatibility, lifecycle, isolation                                     | high       | write ourselves             |
| Structured logging                          | `log/slog`                                                                             | Structured logs with minimal lock-in                                               | high       | stdlib                      |
| Metrics / tracing                           | `prometheus/client_golang` + `otelhttp`                                                | Practical metrics and tracing hooks                                                | high       | use library                 |
| Git integration                             | native `git` via `os/exec`                                                             | Exact Git behavior for user-facing repo operations                                 | high       | stdlib                      |
| SSH integration                             | `golang.org/x/crypto/ssh` + `ssh/agent`                                                | Embedded SSH flows where shelling out is not preferable                            | medium     | use library                 |
| Artifacts / attachments / codegen utilities | stdlib (`io`, `os`, `mime/multipart`, `archive/zip`, `text/template`, `html/template`) | File handling, archives, uploads, simple generation                                | high       | stdlib                      |

## 2. Recommended architecture by subsystem

### HTTP API and routing

* **Recommended library choice:** `go-chi/chi` on top of `net/http`.
* **Why it fits this backend specifically:** This backend has enough route surface area and middleware layering to justify a small router, but not a full framework. `chi` stays fully compatible with `net/http`, gives you clean subrouters/mounts/middleware composition, and keeps lock-in low because handlers remain ordinary `http.Handler` values. Go 1.22 also made `ServeMux` materially better with method-aware patterns and `PathValue`, so the stdlib is no longer weak; `chi` still wins here on route organization, not on magical features. Maturity, maintenance, adoption, cross-platform behavior, and testability are all strong. ([GitHub][1])
* **Main alternatives considered:** plain `http.ServeMux`; larger frameworks.
* **Why those alternatives lost:** `ServeMux` is the best conservative alternative and is good enough for a smaller API surface. Larger frameworks buy you very little for this product and increase lock-in around contexts, middleware, rendering, testing patterns, and extension points.
* **Whether we should wrap the library behind our own interface:** **No.** The interface is already `http.Handler`. Do not invent another router abstraction.

Best default choice: `chi`. Best conservative choice: `ServeMux`. Best if you expect heavy scale: still `net/http` + `chi`; do not pre-optimize into a framework. ([GitHub][1])

### Realtime: WebSockets and SSE

* **Recommended library choice:** `github.com/coder/websocket` for WebSockets; stdlib `net/http` for SSE.
* **Why it fits this backend specifically:** Your complexity is not the socket protocol. It is the connection/session/project manager, routing, replay, force-refresh snapshots, and fan-out rules. `coder/websocket` is a good fit because it has a minimal API, first-class `context` support, concurrent writes, zero dependencies, and passes Autobahn. For SSE, stdlib is enough: `ResponseController.Flush`/`Flusher` covers the transport, and keeping SSE in plain `net/http` avoids unnecessary coupling. MCP’s streamable HTTP transport also maps cleanly to plain HTTP + optional SSE. ([GitHub][2])
* **Main alternatives considered:** `gorilla/websocket`; low-level performance-oriented WebSocket stacks; dedicated SSE libraries.
* **Why those alternatives lost:** `gorilla/websocket` is the best conservative WebSocket alternative and is more widely used, but its API is heavier and less pleasant for this kind of explicit, context-driven backend. Event-driven WebSocket stacks are only worth it if profiling shows the WebSocket transport itself is the bottleneck. Dedicated SSE libraries are unnecessary unless you later need a distributed SSE bus. ([GitHub][3])
* **Whether we should wrap the library behind our own interface:** **Yes.** Use the library only for wire handling. Build your own `ConnectionManager` / `SessionHub` / `ProjectHub` abstraction.

Best default choice: `coder/websocket`. Best conservative choice: `gorilla/websocket`. Best if heavy scale becomes dominant: evaluate an event-driven WebSocket stack only after real profiling. ([GitHub][2])

### Auth and sessions

* **Recommended library choice:** `gorilla/securecookie` for cookie signing; everything else custom.
* **Why it fits this backend specifically:** Your auth model has product-specific semantics: bootstrap token consumption, signed auth cookies, share-session mode, and probably runtime-mode-dependent behavior. That is exactly the kind of logic you should keep in your own code. `securecookie` is useful in a narrow role because it handles authenticated and optionally encrypted cookie values with HMAC, while letting you keep the real session/bootstrap/share rules explicit. That gives you a mature small surface, good ergonomics, easy testing, and low lock-in if you hide it behind a tiny codec helper. ([GitHub][4])
* **Main alternatives considered:** `gorilla/sessions`; `scs`.
* **Why those alternatives lost:** They are good generic session frameworks, but they want to own more of the session model than this product should outsource. Your session semantics are closer to a custom state machine than to generic “load/save session data” middleware. ([Go Packages][5])
* **Whether we should wrap the library behind our own interface:** **Yes.** A tiny internal `CookieCodec` / `SessionSigner` wrapper is enough.

### Stateful runtime / actor-like coordination

* **Recommended library choice:** Plain goroutines, channels, `context`, `errgroup`, and `singleflight`. No actor framework.
* **Why it fits this backend specifically:** This backend is clearly stateful, but it is still fundamentally an explicit single-service runtime with registries, watchers, background tasks, per-project managers, and long-lived in-memory state. Go’s normal concurrency model already fits that well. `errgroup` gives you structured cancellation/error propagation for grouped tasks, and `singleflight` is useful for deduping refreshes, rebuilds, or expensive recomputations. This route has the highest maturity, the lowest lock-in, the best testability, and the clearest control flow for a small team. ([Go Packages][6])
* **Main alternatives considered:** Actor frameworks such as Proto.Actor, Hollywood, and Ergo.
* **Why those alternatives lost:** They bring a much stronger programming model than you need: actors, clustering, supervision trees, remoting, and distributed-system assumptions. That is valuable if the product is fundamentally actor-native. Here it would mostly create conceptual and operational coupling. ([GitHub][7])
* **Whether we should wrap the library behind our own interface:** **No** for `errgroup`/`singleflight`. **Yes** for your own runtime managers and registries.

### File-backed state

* **Recommended library choice:** Stay primarily file-backed with stdlib filesystem APIs; add a small atomic-write helper boundary.
* **Why it fits this backend specifically:** Your product already thinks in terms of workspace-local and app-state directories. That maps naturally to `os`, `io/fs`, `filepath`, and versioned on-disk layouts. Use `os.UserConfigDir` / `os.UserCacheDir` for global roots. Do not write directly everywhere with raw `os.WriteFile`; the stdlib docs note that `WriteFile` can leave partially written files on failure, and Windows rename semantics are tricky enough that a dedicated atomic-write helper is warranted. This is a very good match for maintainability and product ownership, but only if you are disciplined about state layout, versioning, atomic writes, and recovery rules. ([Go Packages][8])
* **Main alternatives considered:** SQLite; bbolt.
* **Why those alternatives lost:** They add a storage model your product does not naturally want right now. SQLite is the best fallback if you later discover you need durable indexed queries, transactions, or a local event/index registry; use it via `database/sql`, and pick the driver later. `bbolt` is a respectable pure-Go embedded KV store, but it is still a database-shaped answer to a product that is mostly file/tree-shaped. ([Go Packages][9])
* **Whether we should wrap the library behind our own interface:** **Yes.** Create an internal `StateStore` / `PathPolicy` / `AtomicWriter` layer.

Best default choice: stay file-backed. Best conservative choice: same. Best if you later need a durable local index: SQLite behind `database/sql`, not as the center of the rewrite. ([Go Packages][9])

### JSON schema validation

* **Recommended library choice:** `santhosh-tekuri/jsonschema/v6` for validation; optionally `invopop/jsonschema` for generation from Go types.
* **Why it fits this backend specifically:** You have real schema needs: tool metadata, MCP-related schemas, plugin manifests, possibly attachment/config validation. `santhosh-tekuri/jsonschema/v6` is the strongest pragmatic validator here: it compiles schemas, validates instances, and supports modern drafts including 2020-12. `invopop/jsonschema` is useful only when reflecting Go types into schemas meaningfully reduces boilerplate; it should not become the source of truth for external contracts. Maturity/ergonomics for validation are strong; lock-in is moderate but manageable if you hide it behind a tiny validator package. ([Go Packages][10])
* **Main alternatives considered:** older draft-limited validators; tag-heavy validation approaches.
* **Why those alternatives lost:** Your backend already has external schema-shaped surfaces. A modern JSON Schema validator is a better fit than ad hoc reflection tags or older validators stuck on older drafts.
* **Whether we should wrap the library behind our own interface:** **Yes, lightly.** An internal `SchemaValidator` package is sufficient.

### MCP server/client support

* **Recommended library choice:** `modelcontextprotocol/go-sdk`, wrapped tightly.
* **Why it fits this backend specifically:** The Go MCP story is now good enough to use: the SDK is official, listed as Tier 1, and supports the important transport modes you care about, including stdio, streamable HTTP, and legacy SSE. That makes it the best default for both serving MCP tools and connecting to external MCP servers. Confidence is still **medium**, not high, because the spec and transports are moving quickly; lock-in risk is therefore higher than with routing/logging. The answer is not “build MCP from scratch,” it is “use the official SDK, but isolate it.” Also follow the transport security guidance: validate `Origin`, prefer localhost binding for local servers, and require auth. ([GitHub][11])
* **Main alternatives considered:** non-official Go SDKs; hand-rolled JSON-RPC transport.
* **Why those alternatives lost:** The official SDK is now strong enough that a custom transport stack is unnecessary default complexity. Non-official SDKs only win if the official one blocks a concrete need.
* **Whether we should wrap the library behind our own interface:** **Yes, absolutely.** Hide SDK-specific request/response and transport types behind internal MCP service interfaces.

### LLM/chat orchestration

* **Recommended library choice:** Keep the orchestration core custom. Use official provider SDKs only in thin edge adapters.
* **Why it fits this backend specifically:** This backend has product-specific chat/runtime/tool/MCP behavior. That is the center of the system, not commodity glue. Use provider SDKs for auth, transport, and streaming, then convert immediately into your own internal event model. This keeps performance predictable, testing straightforward, and lock-in low. It also lets you preserve frontend/backend contracts while redesigning internals. ([GitHub][12])
* **Main alternatives considered:** LangChain-style orchestration frameworks.
* **Why those alternatives lost:** They add a second abstraction language over a part of the product that should remain explicit and typed. This backend wants transparent control flow, not agent framework magic. LangChainGo is real and active, but I would not make it the architectural center of a production rewrite like this. ([GitHub][13])
* **Whether we should wrap the library behind our own interface:** **Yes.** Provider SDKs should sit behind internal model/provider adapters.

### Subprocess orchestration, PTY terminals, and LSP

* **Recommended library choice:** `os/exec` for subprocesses, `aymanbagabas/go-pty` + `x/term` for PTY, and a custom LSP manager with an optional `sourcegraph/jsonrpc2` helper.
* **Why it fits this backend specifically:** `os/exec` is already the right base for child processes and long-running subprocesses. `errgroup` pairs well with it for supervision/cancellation. For PTY, cross-platform support matters, and `go-pty` explicitly supports Unix PTYs and Windows via ConPTY; that is the key reason to prefer it over Unix-only `creack/pty`. `x/term` gives you raw mode, restore, and terminal sizing. This stack is explicit, testable, and low ceremony. ([Go Packages][14])
* **Main alternatives considered:** `creack/pty`; full LSP/JSON-RPC frameworks.
* **Why those alternatives lost:** `creack/pty` is Unix-only, and even its examples are explicitly not intended as production code. For LSP specifically, the Go ecosystem is weaker than it should be for a polished general-purpose client stack. `sourcegraph/jsonrpc2` is useful as a small transport helper because it supports VS Code-style `Content-Length` framing, but it is not a full LSP client and notes that batch requests/responses are unsupported. `go.lsp.dev/protocol` is convenient for types, but its published spec version is 3.15.3 while the current published LSP spec line is 3.17.0. `GLSP` describes itself as an early release and is oriented toward implementing servers. So the right answer is a custom LSP adapter and manager, not betting the architecture on a Go LSP framework. ([Go Packages][15])
* **Whether we should wrap the library behind our own interface:** **Yes.** Use internal `ProcessSupervisor`, `TerminalService`, and `LSPService` boundaries.

### File watching

* **Recommended library choice:** `fsnotify`, wrapped in your own recursive/debounce/coalescing layer.
* **Why it fits this backend specifically:** `fsnotify` is still the obvious production choice. It is cross-platform and mature. The important part for your product is not raw watch events, it is recursive registration, per-project watch scopes, debouncing, coalescing, and translating noisy filesystem changes into stable runtime refresh events. Cross-platform caveats matter: it is not recursive by default, network filesystems are problematic, and macOS/BSD `kqueue` costs file descriptors per watched file. ([GitHub][16])
* **Main alternatives considered:** polling or hand-rolled watch loops.
* **Why those alternatives lost:** They are only worth it when you have a very specific unsupported filesystem environment.
* **Whether we should wrap the library behind our own interface:** **Yes.** The wrapper is where the product semantics live.

### Plugins / extensibility

* **Recommended library choice:** Custom plugin manifests and compatibility rules, with plugins running out of process over stdio/MCP/JSON-RPC as needed.
* **Why it fits this backend specifically:** This product needs discovery, schemas, install/runtime metadata, lifecycle management, and cross-platform behavior. That is not the same problem as “load a Go plugin.” The stdlib `plugin` package is the wrong foundation here: the docs explicitly warn that it is only supported on Linux/FreeBSD/macOS and list major drawbacks around portability, race detection, build sameness, and crash risk. That makes it a bad fit for a macOS/Linux/Windows product. ([Go Packages][17])
* **Main alternatives considered:** stdlib `plugin`; HashiCorp `go-plugin`.
* **Why those alternatives lost:** stdlib `plugin` is out for cross-platform reasons. HashiCorp `go-plugin` is the serious heavy-duty alternative if third-party binary plugins become strategic: it is battle-hardened, supports protocol versioning and cross-language plugins over gRPC/RPC, and manages subprocess lifecycle. But it is much heavier than you need for an internal/plugin-adjacent extensibility model. ([GitHub][18])
* **Whether we should wrap the library behind our own interface:** **Yes.** Plugin contracts are core product architecture.

This is one of the places where the **Go ecosystem is weak here** answer is correct: not because there are no tools, but because the available tools push you toward either non-portable in-process loading or a heavy RPC plugin system. Your own process boundary is the better long-term center.

### Logging / observability

* **Recommended library choice:** `log/slog` for logs, `prometheus/client_golang` for metrics, `otelhttp` for tracing hooks.
* **Why it fits this backend specifically:** `slog` gives you structured logging in the standard library, which minimizes lock-in and makes log formatting/searching sane. `otelhttp` wraps existing handlers cleanly for tracing, and Prometheus’ Go client is still the practical default for in-process metrics exposition. This is enough observability for a production rewrite without dragging in an observability framework culture war. Maturity is high; cross-platform and testability are good; lock-in is low to moderate. ([Go][19])
* **Main alternatives considered:** higher-throughput third-party logging stacks.
* **Why those alternatives lost:** They only win if profiling proves logging throughput itself is a problem. For most backends like this, `slog` is the right ownership tradeoff.
* **Whether we should wrap the library behind our own interface:** **No big abstraction.** Use `*slog.Logger` directly, with one internal helper package for common fields and error rendering.

### Git / SSH / filesystem integration

* **Recommended library choice:** Use native `git` via `os/exec` for user-facing Git behavior; use `x/crypto/ssh` and `ssh/agent` when you need embedded SSH; stdlib is enough for most filesystem/artifact work.
* **Why it fits this backend specifically:** For Git routes, exact behavior matters more than theoretical purity. Shelling out to real `git` preserves worktree behavior, config handling, submodules, and other edge cases users already expect. Pure-Go Git is useful, but better as a narrow helper than as the authoritative implementation. `go-git` is active and capable, but it still shows visible gaps around sparse-checkout-related behavior and recent Windows regressions, which is enough for me to avoid making it the primary user-facing Git layer. For SSH, `x/crypto/ssh` and `ssh/agent` are correct when you need embedded control; otherwise shelling out to system `ssh` is better when exact user-environment behavior matters. For attachments/artifacts and simple code generation, stdlib packages are sufficient. ([GitHub][20])
* **Main alternatives considered:** `go-git` as primary Git layer; pure-Go SSH everywhere.
* **Why those alternatives lost:** They lose on behavioral parity and environment fidelity, not because they are unusable.
* **Whether we should wrap the library behind our own interface:** **Yes.** `GitService` and `SSHService` should be internal boundaries.

## 3. What we should write ourselves

* **Auth/session state machine.** Cookie signing is library territory; bootstrap token exchange, share-session mode, session secret rotation rules, runtime-mode access rules, and session invalidation are product logic.

* **Realtime connection manager.** The important part is not WebSocket or SSE framing. It is connection identity, routing by session/project, replay/force-refresh snapshots, event ordering, fan-out, and backpressure policy.

* **Runtime managers and registries.** Per-project/per-workspace/per-session supervisors, caches, watchers, dependency snapshots, and lifecycle rules should remain explicit internal code.

* **File-state layout, versioning, and migrations.** Libraries can help you write files safely; they should not define your on-disk state model. Directory layout, file naming, schema versioning, migrations, lock files, and recovery behavior are core ownership surfaces.

* **LLM/chat orchestration.** Provider SDKs belong at the edge only. Conversation state, tool orchestration, retry semantics, model/provider routing, MCP mediation, and frontend streaming contracts should be yours.

* **Tool registry / metadata / search.** Libraries can validate schemas; they should not define how tools are registered, indexed, ranked, filtered, versioned, or exposed to the frontend.

* **LSP manager.** Use helpers for framing if useful, but process lifecycle, initialization sequencing, restart policy, cancellation, file-sync behavior, and capability mapping should stay custom.

* **Plugin contract and lifecycle.** Discovery, manifest schema, compatibility checks, sandboxing, startup/shutdown policy, and runtime metadata should be internal architecture, not inherited from a plugin framework.

* **Git/SSH workflow policy layer.** Even when you shell out to `git` or `ssh`, your rules around allowed operations, environment setup, path normalization, timeouts, and error translation should be custom.

The general rule is simple: use libraries for **wire protocols, codecs, and OS integration**; keep anything that expresses **product semantics or long-term storage shape** in your code.

## 4. Migration-risk notes

**Straightforward to port**

* HTTP APIs, routing, middleware, cookies, request context, file upload/download, and JSON responses.
* Structured logging, basic metrics, HTTP tracing hooks.
* Subprocess supervision with `os/exec`.
* File watching, as long as you build your own debounce/recursive wrapper.
* JSON Schema validation.
* Basic artifact/attachment IO and archive handling.

**Medium risk**

* Auth/session behavior, because the semantics are custom rather than library-defined.
* Realtime behavior, because the hard part is the connection/session manager and replay semantics.
* File-backed state, because the rewrite is a good chance to clean up on-disk contracts, which creates migration work.
* PTY support, especially on Windows, because terminal behavior leaks OS details. ([GitHub][21])

**High risk / likely architecture work**

* **LSP.** The protocol is stable, but the Go client ecosystem is not especially satisfying, and some type packages lag the current spec. ([Go Packages][22])
* **Plugins.** Cross-platform in-process Go plugins are a dead end for this product, so you will need a deliberate out-of-process model. ([Go Packages][17])
* **MCP.** The official Go SDK is now good, but the spec/transports are still moving quickly, so keep your abstraction boundary tight. ([GitHub][11])
* **Git if you try to stay pure-Go.** User-visible Git compatibility is where pure-Go libraries are most likely to create mismatch pain. ([GitHub][20])
* **LLM/chat orchestration.** Not because Go is weak here, but because the orchestration behavior is part of the product and often forces redesign during rewrites.

## 5. Suggested phased adoption plan

**Lock first**

1. **HTTP base:** `net/http` + `chi`, request/response conventions, error envelope, middleware shape.
2. **Runtime model:** explicit manager/registry pattern using goroutines + `context` + `errgroup`; no actor framework.
3. **Auth boundary:** cookie signing mechanism and custom session/bootstrap/share-session model.
4. **On-disk state contract:** state roots, directory layout, versioning, atomic writes, migration strategy.
5. **Realtime event model:** server event envelope, snapshot/replay semantics, project/session routing.
6. **Process boundary abstractions:** subprocess supervisor, PTY service, LSP service, MCP service.

These choices influence almost everything else.

**Implement early**

1. Logging with `slog`.
2. Metrics/tracing hooks with Prometheus + `otelhttp`.
3. File watching wrapper around `fsnotify`.
4. Git shell wrapper and SSH wrapper.
5. JSON Schema validator package.

**Defer until a concrete need appears**

1. Exact embedded-DB choice, if any.
2. Schema generation from Go structs.
3. HashiCorp `go-plugin`.
4. Pure-Go Git beyond narrow helper use.
5. Any higher-performance JSON/WebSocket specialization.
6. Broad tracing beyond HTTP and a few high-value spans.

**Leave as last major integration work**

1. Full MCP parity.
2. LSP process matrix across platforms/language servers.
3. Plugin lifecycle/runtime isolation.
4. Final LLM/provider orchestration shape.

## 6. Shortlist

**use this**

* `net/http`
* `go-chi/chi`
* `github.com/coder/websocket`
* stdlib SSE/streaming with `ResponseController` / `Flusher`
* goroutines + `context` + `x/sync/errgroup` + `singleflight`
* `santhosh-tekuri/jsonschema/v6`
* `modelcontextprotocol/go-sdk`
* `os/exec`
* `fsnotify`
* `log/slog`
* `prometheus/client_golang`
* `otelhttp`
* `golang.org/x/term` ([GitHub][1])

**probably use this**

* `gorilla/securecookie`
* `aymanbagabas/go-pty`
* official provider SDKs like `openai-go` and `anthropic-sdk-go`, but only behind adapters
* `invopop/jsonschema` for selective schema generation
* `sourcegraph/jsonrpc2`, but only inside a custom LSP adapter
* SQLite behind `database/sql` later, if a real indexed local store becomes necessary ([GitHub][4])

**avoid unless a concrete need appears**

* Large web frameworks
* Full session frameworks as the primary auth model
* Actor frameworks
* ORMs as a central persistence model
* Stdlib `plugin`
* `hashicorp/go-plugin`
* `go-git` as the primary user-facing Git implementation
* Embedded DB as the center of state
* LangChain-style orchestration frameworks as the core runtime ([Go Packages][17])

**write ourselves**

* auth/session flow semantics
* realtime connection/session/project manager
* runtime managers/registries/watcher coordination
* file-state layout/versioning/migration rules
* tool registry / metadata / search
* LLM/chat orchestration core
* LSP manager
* plugin discovery / compatibility / lifecycle
* Git/SSH policy wrapper
* API error model and frontend contract layer

[1]: https://github.com/go-chi/chi "https://github.com/go-chi/chi"
[2]: https://github.com/coder/websocket "GitHub - coder/websocket: Minimal and idiomatic WebSocket library for Go · GitHub"
[3]: https://github.com/gorilla/websocket "https://github.com/gorilla/websocket"
[4]: https://github.com/gorilla/securecookie "https://github.com/gorilla/securecookie"
[5]: https://pkg.go.dev/github.com/alexedwards/scs/v2 "https://pkg.go.dev/github.com/alexedwards/scs/v2"
[6]: https://pkg.go.dev/golang.org/x/sync/errgroup "https://pkg.go.dev/golang.org/x/sync/errgroup"
[7]: https://github.com/asynkron/protoactor-go "https://github.com/asynkron/protoactor-go"
[8]: https://pkg.go.dev/os "https://pkg.go.dev/os"
[9]: https://pkg.go.dev/database/sql "https://pkg.go.dev/database/sql"
[10]: https://pkg.go.dev/github.com/santhosh-tekuri/jsonschema/v6 "https://pkg.go.dev/github.com/santhosh-tekuri/jsonschema/v6"
[11]: https://github.com/modelcontextprotocol/go-sdk "https://github.com/modelcontextprotocol/go-sdk"
[12]: https://github.com/openai/openai-go "https://github.com/openai/openai-go"
[13]: https://github.com/tmc/langchaingo "https://github.com/tmc/langchaingo"
[14]: https://pkg.go.dev/os/exec "https://pkg.go.dev/os/exec"
[15]: https://pkg.go.dev/github.com/sourcegraph/jsonrpc2 "https://pkg.go.dev/github.com/sourcegraph/jsonrpc2"
[16]: https://github.com/fsnotify/fsnotify "https://github.com/fsnotify/fsnotify"
[17]: https://pkg.go.dev/plugin "https://pkg.go.dev/plugin"
[18]: https://github.com/hashicorp/go-plugin/blob/master/README.md "https://github.com/hashicorp/go-plugin/blob/master/README.md"
[19]: https://go.dev/blog/slog "https://go.dev/blog/slog"
[20]: https://github.com/go-git/go-git "https://github.com/go-git/go-git"
[21]: https://github.com/aymanbagabas/go-pty "https://github.com/aymanbagabas/go-pty"
[22]: https://pkg.go.dev/go.lsp.dev/protocol "https://pkg.go.dev/go.lsp.dev/protocol"
