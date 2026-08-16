# Python Canvas

This is the Phase B read-only scaffold for Python Canvas. It fetches the V1
project snapshot, validates it at the browser boundary, and projects it into a
minimal workspace with a Callable section and a read-only Generated Python
section.

The Vite development server proxies `/api` requests to `127.0.0.1:8080`. Run a
compatible backend separately before opening the app. Available package scripts
are `pnpm --filter @setta/python-canvas dev`, `test`, `build`, and
`contract:check`.

Phases C–E are intentionally deferred. They will add callable and parameter
authoring with an explicit commit path, generated-code and diagnostics
synchronization, Basedpyright and LSP lifecycle work, and command-driven
workspace interactions. This scaffold contains no mutation API, retries,
polling, compatibility behavior, or fallback project data.
