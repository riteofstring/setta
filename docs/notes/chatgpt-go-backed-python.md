Think in layers, not in one mechanism:

* **Go should own behavior**: state transitions, protocol semantics, runner lifecycle, authoritative validation.
* **A schema should own contracts**: request/response/event types and the part of validation that can be expressed declaratively.
* **Python should own ergonomics**: `SettaRunner`, `SettaListener`, convenience constructors, context managers, callbacks/iterators, exception mapping.

That gives you one real source of truth without making Python users feel like they are using a transport library. Protobuf + Buf + shared validation are a strong fit for the contract layer; the real choice is whether Python talks to Go across a **process boundary** or an **in-process ABI**. ([Buf][1])

## 1. Managed local Go core process + typed RPC

This is the strongest default. The Python package launches a long-lived Go binary with `subprocess`, connects over a local socket, and keeps the current Python API as a handwritten façade over generated clients and DTOs. Use **gRPC today** for Python because official Go and Python support, generated-code tooling, and performance guidance are well established; model `SettaListener` as a stream of events rather than as fine-grained cross-language callbacks. This removes **most** duplication: Go owns runtime/state/protocol behavior, the schema owns message shapes and a large chunk of validation, and Python keeps only UX logic. Packaging is **medium**: either bundle a Go executable in platform-specific wheels or install it separately. Performance is usually **medium-high** if the boundary is coarse-grained, channels are reused, and long-lived flows use streaming instead of many tiny unary calls. Cross-platform reliability is **high** because you avoid cgo pointer/ABI issues entirely. ([Python documentation][2])

This option is especially good if `SettaRunner` is command-oriented and `SettaListener` is event-oriented. gRPC explicitly recommends reusing channels/stubs and using streaming for long-lived logical flows. On Unix you can use UDS; in Python’s gRPC runtime, local credentials exist for UDS and local TCP, though they are marked experimental. ([gRPC][3])

A variation is **Connect** instead of gRPC. Connect’s protocol supports unary and all streaming forms, unary works over plain HTTP/1.1, and the protocol is curl-friendly and debuggable with ordinary HTTP tooling. That is attractive for observability and future remote/public use. The caveat is that **connect-python is still beta** and its docs warn that 1.0 may bring breaking changes, so I would treat Connect as a future option or a Go-side choice only after Python runtime maturity improves. ([Protobuf RPC that works][4])

## 2. Managed local Go core + simpler custom IPC

This is the “smallest machinery” process-boundary design: spawn the Go binary and speak framed JSON, msgpack, or a tiny custom protocol over stdio or a local socket. It removes almost as much duplication as option 1 because Go can still own the runtime. Packaging and cross-platform behavior are also good because you are still just shipping a process plus a Python façade. The tradeoff is that **you own the protocol forever**: schema evolution, generated DTOs, validation reuse, streaming semantics, and compatibility testing become your problem instead of the toolchain’s. I would only choose this if the internal surface area is narrow and intentionally private. ([Python documentation][2])

I would not build this on Go’s stdlib `net/rpc`: it is explicitly frozen, and the stdlib JSON codec is JSON-RPC 1.0. That is fine for tiny internal tools, but not a great foundation for a modern SDK boundary you expect to evolve. ([Go Packages][5])

## 3. In-process Go shared library loaded by Python

This is the closest to your “Cython, but Go” idea. Go can build a C shared library with `-buildmode=c-shared`, exporting only `//export` functions, and Python can load shared libraries with `ctypes`. Duplication removed is **very high** and per-call latency is the **best** of all options. The price is native-integration complexity: cgo pointer rules are strict, Go values that cross C boundaries often need `runtime/cgo.Handle`, and memory ownership/error propagation become part of your API design. Debugging is the hardest here because failures cross runtimes and can become process crashes instead of Python exceptions. ([Go Packages][6])

Packaging is also the hardest. Once Python installs binary code, you are in platform-specific wheel territory; platform-compatibility tags exist for exactly that reason. A tiny CPython wrapper can use the Limited API / Stable ABI (`abi3`) to reduce rebuilds across Python 3.x versions, but that only stabilizes the CPython-facing layer. You still need a Go build per OS/arch, and ABI stability is still platform-dependent. Migration difficulty is therefore **high** unless performance requirements clearly justify it. ([Python Packaging][7])

If you ever choose this route, keep the C ABI **narrow**: bytes in / bytes out, opaque handles, explicit init/shutdown, and no direct exposure of Go object graphs or Python callbacks.

## 4. Shared contracts/codegen only, while keeping both runtimes

This is the easiest first move and is worth doing even if you later adopt option 1. Put contracts in `.proto`, generate Go and Python code from the same schema, and move declarative validation into the schema with Protovalidate. Buf gives you code generation, remote plugins, generated Python SDKs installable with `pip`, linting, and breaking-change detection. This can eliminate most duplication in **types, wire format, and a meaningful slice of validation**, while leaving runtime behavior duplicated for the moment. Packaging stays easy because your Python package can remain pure-Python. Migration difficulty is **low**. The limitation is straightforward: it does **not** solve duplicated state machines or runtime behavior by itself. ([Buf][1])

For many teams, this is the right phase-1 move even if the end state is a Go core process.

## 5. HTTP/JSON + OpenAPI-generated Python client

This is viable if the real boundary is just an HTTP API and you do not need a local runtime feel. OpenAPI Generator’s Python client generator is marked stable and supports multiple library templates, including `urllib3` and `httpx`. Packaging and debugging are simple, and developer onboarding is familiar. The weakness is fit: it is less natural for a local language-runtime boundary and for listener/runner-style event flows than a protobuf RPC boundary. I would consider it only if your Go side is already fundamentally an HTTP/JSON service and the SDK is mostly a convenience wrapper over that service. ([OpenAPI Generator][8])

## What I would avoid

I would not build this around Go’s `plugin` package. The official docs warn that it is only supported on Linux, FreeBSD, and macOS, is poorly supported by the race detector, and is prone to crashes unless toolchain versions and shared dependencies match exactly. That is the opposite of what you want for a Python SDK intended to be easy to install and portable. ([Go Packages][9])

## Recommended direction

**Recommended target architecture:**
**Go-owned runtime behind a managed local process boundary, with Protobuf/Buf/Protovalidate as the shared contract layer, and a handwritten Python façade that preserves your current SDK style.**

In practice, that means:

* **Go is the source of truth** for project state transitions, protocol behavior, runner/listener lifecycle, and authoritative validation.
* **Protobuf schemas are the source of truth** for DTOs and schema-level validation.
* **Python is the source of truth only for ergonomics**: friendly constructors, context managers, sync/async wrappers, iterator/callback adapters, and idiomatic exceptions. ([Protovalidate][10])

Why this over in-process FFI: it gets you almost the same duplication reduction, much better cross-platform reliability, better debuggability, and a cleaner testing/versioning story. Why this over schema-only: it also removes duplicated runtime behavior. Why gRPC first: it is the lower-risk Python transport today; Connect is attractive, but Python is still beta. ([gRPC][11])

## Practical migration path

1. **Define the boundary around commands, events, and snapshots.**
   Do not mirror internal structs or expose chatty getter/setter RPCs. Make `SettaRunner` operations command-style, and make `SettaListener` an event stream. This is what keeps IPC overhead acceptable.

2. **Create a contract layer now.**
   Add `proto/` (or equivalent), adopt Buf for `generate`, `lint`, and `breaking`, and express reusable validation in Protovalidate. Generate Go and Python artifacts from the same contracts. This immediately stops new DTO and validation drift. ([Buf][1])

3. **Replace Python duplicate DTOs/validators before moving behavior.**
   Keep the current Python implementation temporarily, but swap in generated types and shared validation where possible. This lowers migration risk because behavior stays unchanged while contracts converge. Buf’s generated Python SDK path can help if you want contract artifacts published through a pip-compatible repo. ([Buf][12])

4. **Introduce `setta-core` as a local Go binary and hide it behind the existing Python classes.**
   The Python package should autostart the core with `subprocess`, negotiate a version handshake, connect over a local socket, and translate transport errors into your current exception model. If you bundle the binary inside wheels, publish platform-specific wheels; platform tags are the packaging mechanism for that. ([Python documentation][2])

5. **Move runtime behavior behind the boundary incrementally.**
   Start with the most duplicated or most correctness-sensitive path first, usually the runner state machine and listener stream. Keep the old Python path behind a feature flag until parity is proven.

6. **Lock down compatibility and observability.**
   Add contract tests, Python-to-core integration tests, and version-compatibility tests. Use `buf breaking` in CI so contract evolution is deliberate. Emit structured logs from both Python and Go, and include explicit protocol/core version info in startup and error messages. ([Buf][13])

## Net recommendation by scenario

* **Best overall**: local Go core process + gRPC + Protobuf/Buf/Protovalidate.
* **Best raw speed**: in-process Go shared library, but only if profiling proves the process boundary is too slow.
* **Best first step**: shared contracts/codegen now, then move runtime behind a process boundary.
* **Best only for narrow internal tooling**: custom stdio/JSON IPC.
* **Best only for HTTP-first services**: OpenAPI client generation.

The version I would build for your codebase is: **Python-first façade, Go-owned core, schema-owned contracts**. That gives you the “Python API backed by native code” feel without taking on the fragility of a full in-process Go/Python ABI.

[1]: https://buf.build/docs/generate/ "https://buf.build/docs/generate/"
[2]: https://docs.python.org/3/library/subprocess.html "https://docs.python.org/3/library/subprocess.html"
[3]: https://grpc.io/docs/guides/performance/ "https://grpc.io/docs/guides/performance/"
[4]: https://connectrpc.com/docs/protocol/ "https://connectrpc.com/docs/protocol/"
[5]: https://pkg.go.dev/net/rpc "https://pkg.go.dev/net/rpc"
[6]: https://pkg.go.dev/cmd/go "https://pkg.go.dev/cmd/go"
[7]: https://packaging.python.org/specifications/platform-compatibility-tags/ "https://packaging.python.org/specifications/platform-compatibility-tags/"
[8]: https://openapi-generator.tech/docs/generators/python/ "https://openapi-generator.tech/docs/generators/python/"
[9]: https://pkg.go.dev/plugin "https://pkg.go.dev/plugin"
[10]: https://protovalidate.com/ "https://protovalidate.com/"
[11]: https://grpc.io/docs/what-is-grpc/introduction/ "https://grpc.io/docs/what-is-grpc/introduction/"
[12]: https://buf.build/docs/bsr/generated-sdks/python/ "https://buf.build/docs/bsr/generated-sdks/python/"
[13]: https://buf.build/docs/breaking/ "https://buf.build/docs/breaking/"
