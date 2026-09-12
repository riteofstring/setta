# Setta Bench

Setta Bench is a small local application for comparing two or more code-based
candidates against the same frozen case set. It is deliberately an experiment
workbench rather than a general tracking platform: author the comparison in
Build, watch it execute in Runs, and record a decision in Compare.

The application uses `@setta/workspace` as its only shell. Case sets,
candidates, and shared checks are Workspace sections connected by a controlled
data graph. Build, Runs, and Compare are fixed Workspace saved-view tabs. Run
history and side-by-side results use Workspace-managed windows, while Outline,
Inspector, toolbar commands, navigation, zoom, and section interaction all come
from Workspace itself.

## Product thumbnail example

The checked-in CPU-only example compares `contain` and `cover` thumbnail
strategies across ten generated catalog images. Both candidates produce real
512 × 512 PNG artifacts. Shared checks verify dimensions and file size, and the
Compare view aligns each case for visual review.

From a source checkout, seed the example into an isolated local workspace,
build its Go candidate with the pinned toolchain, and open the app with:

```sh
pnpm bench:playground
```

The reusable workspace lives at `tmp/bench-playground/product-thumbnails` so
its run history and saved reviews survive later launches.

The browser acceptance journey creates an isolated copy of this fixture, builds
the Go candidate and host with the pinned toolchain, launches all twenty case
executions, compares the resulting images, saves a preference, and verifies the
review after a page reload:

```sh
pnpm --filter @setta/bench run browser:test
```

Set `BENCH_CHROME_BINARY` to an absolute Chrome or Chromium path when the shared
headless-browser helper cannot use its macOS default.

## Development

Generate the Go-owned TypeScript contract and standalone response validators:

```sh
pnpm --filter @setta/bench run contract:generate
```

Run the narrow frontend suite or create a production build:

```sh
pnpm --filter @setta/bench run test
pnpm --filter @setta/bench run build
```

`pnpm --filter @setta/bench run dev` starts Vite and proxies `/api` to
`http://127.0.0.1:8082` by default. Set `SETTA_BENCH_BACKEND_ORIGIN` to point it
at another local Bench host.

## Candidate protocol

A candidate is any executable described by an argument vector and working
directory. For each case, Bench sends one `bench-candidate/v1` JSON request on
standard input. The candidate emits progress and a final result as newline
delimited JSON on standard output, placing declared artifact files in the
provided output directory. Bench owns concurrency, timeouts, cancellation,
durable run records, artifact hashing, and evaluator checks.

Project definitions use optimistic revisions. A launch freezes the case set,
candidates, and evaluator into immutable provenance before execution. Runs and
reviews remain available after restarting the local host. V1 does not label an
ordinary command with Git state because it does not freeze that command's
working tree; imported Python Canvas bundles are copied into immutable,
project-owned storage instead.
