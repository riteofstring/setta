# Bench backend design rationale

This document owns current non-local rationale for the `bench-backend` module. Public commands,
project setup, and candidate protocol usage belong in `apps/bench/README.md`.

## Ownership and dependency direction

Bench is a standalone Go application. It owns the comparison project, strict transport contracts,
durable launches and runs, bounded child-process execution, adopted artifacts, reviews, and local
HTTP hosting. It does not import Python Canvas or Realtime internals. The browser projects complete
snapshots and owns only disposable selection and window state; candidate processes produce case
results but never mutate canonical project or run records.

The application deliberately has no general workflow graph, evaluator plugin framework, remote
worker abstraction, database, or WebSocket. Revision-checked HTTP commands handle mutations and a
latest-value server-sent event stream publishes complete application snapshots. Go's standard
library is sufficient for HTTP, persistence, image inspection, hashing, and the first example.

## Authored comparison

One project contains one case-set manifest, an ordered list of at least two command candidates, one
optional shared check set, and a closed Workspace presentation. Candidate commands are argument
arrays with an optional project-relative working directory; they are never shell strings. The
structural graph is derived: the case set feeds every candidate and every candidate feeds the same
check set. Launches, runs, cases, results, artifacts, and reviews are runtime records rather than
authored canvas sections.

The project document lives at `.local/bench/project.json`. It is strict, versioned, and rejects
unknown or duplicate fields, invalid UTF-8, unsupported versions, path escapes, malformed layouts,
and incompatible relationships. A replacement supplies project identity and the observed revision,
validates one complete candidate document, writes through a synced same-filesystem sibling, and
atomically renames it. A successful replacement increments the revision exactly once; conflict or
persistence failure leaves canonical state unchanged.

The case set is bounded JSONL with stable case IDs, a JSON input, and optional expected JSON. Bench
reads and freezes the ordered cases when accepting a launch. A launch creates one run per selected
candidate, freezes candidate configuration and project revision, durably writes all queued records,
and only then makes work eligible to execute. Terminal run and case results are immutable. Rerun
creates a new launch from the stored specification instead of editing history.

## Execution boundary

Each case runs in a fresh contained child process under a coordinator-owned concurrency limit. The
host writes one closed JSON request to stdin containing protocol, run, and case identities, input,
expected values, and a dedicated output directory. Candidate stdout is bounded newline-delimited
JSON and may contain monotone progress messages followed by exactly one result or error. A result
contains JSON output, typed observations, and relative artifact paths. Stderr is a separate bounded
log. Unknown, duplicated, out-of-order, oversized, or trailing messages fail that case without
affecting sibling cases.

Candidate commands resolve beneath the project or through the current executable search path. Each
execution receives a new staging directory. Adopted artifacts must be regular non-symlink files
beneath that directory. Bench copies them into run-owned storage while measuring length and SHA-256,
then exposes only opaque artifact IDs. Shared checks are declarative Go policies: maximum artifact
bytes and optional image width and height. Duration is host-measured. Candidate output is evidence,
not a trusted check result.

Cancellation and timeout terminate the owned process tree before a case becomes terminal. Closing
the application stops admission, cancels active cases, waits for cleanup, and only then returns.
Startup never resumes work implicitly; persisted queued or running records become `interrupted` so
history remains honest. Corrupt runtime history is surfaced independently of authored-project
validity.

## Persistence and publication

Runtime state is separate from the project document:

```text
.local/bench/runs/<launch-id>/launch.json
.local/bench/runs/<launch-id>/<run-id>.json
.local/bench/runs/<launch-id>/artifacts/<run-id>/<case-id>/...
.local/bench/reviews.json
.local/bench/staging/...
```

Writes use bounded JSON, synced temporary files, atomic same-filesystem rename, and directory sync.
A launch directory is installed atomically before execution begins. Reviews are mutable annotations
over two terminal run identities; they never rewrite either run. Subscribers immediately receive a
complete snapshot and later receive the newest complete snapshot, so reconnect requires no replay
or browser-side merging.

The server binds IPv4 loopback, validates Host, requires the exact same Origin on mutations, and
keeps API, event, artifact, and SPA routes separate. Static assets must be regular non-symlink files
beneath the configured root. Accepted work belongs to the coordinator rather than the initiating
HTTP request context.

## Sibling handoff

Python Canvas exports a versioned, public Bench candidate bundle rather than sharing internal
packages. The bundle identifies its source project, revision, callable, deep link, command, and
frozen runnable directory. Bench validates and copies the material into project-owned storage at
acceptance. Once accepted, source-project changes cannot silently alter a Bench run.

The repository playground uses ordinary command candidates and the same public process protocol.
It therefore validates the core application without depending on another Setta application while
the handoff remains an additional sibling path.
