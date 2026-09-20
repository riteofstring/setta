# Local backend design rationale

This document owns current non-local rationale for the `local-backend` module. Product routes,
project formats, commands, and public contracts remain in the four application backend design
records and READMEs.

## Boundary and dependency direction

`github.com/setta/local-backend` is a repository-local Go infrastructure module beneath Python
Canvas, Realtime, Review, and Experiment Lens. It imports no application package and has no
knowledge of application IDs, route versions, project schemas, product state, revisions, or
readiness documents. Each application imports the module through an exact local module edge and
supplies values whose product semantics it has already validated. The packaged runtime continues
to supervise compiled application servers; the shared module is never loaded from a source
checkout at runtime.

The module uses the standard library unless an extracted cross-platform primitive requires an
already admitted dependency. A new package is justified only by at least two current consumers
with one complete contract. It must reduce duplicated state and failure paths rather than collect
similar-looking helpers.

## Security and lifecycle invariants

Trust-boundary checks fail closed and are not caller-disableable. Hosting remains IPv4-loopback
only, admits an exact authority and same-origin mutations, excludes API-like paths from SPA
fallback, and serves only preflighted regular non-symlink assets. File operations remain within a
canonical caller-supplied root, reject symlink traversal and irregular files, bound reads, stage on
the target filesystem, synchronize complete bytes, replace atomically, and synchronize the parent
directory. Mutable local state is compared through authoritative values such as revisions, never
through a newly computed digest.

Operations that can wait accept cancellation or enforce an explicit bound. Shutdown, subscriber
cancellation, lock release, process termination, and other cleanup operations are safe when
repeated. A failure is returned to the owning application rather than hidden or converted into a
product response.

The strict JSON boundary accepts one valid UTF-8 value, rejects duplicate decoded object keys,
limits nesting to 32 containers and decoded string, field-name, and number tokens to 8 MiB, and
caps the complete document at 64 MiB. Callers retain any smaller boundary-specific byte limit.
`Validate` applies those lexical rules to open JSON values; `Decode` additionally rejects unknown
fields in closed Go shapes. Application semantic validation always follows decoding.

## Package ownership

- `localweb` owns production asset admission, closed local HTTP hosting mechanics, exact Host and
  Origin checks, security headers, loopback listening, and bounded serving lifecycle.
- `projectfs` owns canonical-root confinement, bounded regular-file access, synchronized sibling
  staging, atomic replacement, directory synchronization, and platform advisory locks.
- `latestvalue` owns detached initial-current subscriptions and non-blocking buffer-one newest
  value publication.
- `strictjson` owns the shared lexical JSON boundary. `httpjson` and `sse` own bounded HTTP and
  event-stream mechanics, not product statuses, errors, routes, or event names.
- `proctree` owns only platform descendant containment, bounded termination, wait, and cleanup.
  It creates and assigns kill-on-close Windows Job Objects, revalidates POSIX group identity before
  signaling, adopts and reaps Linux descendants under an explicit deadline, and supplies the fixed
  macOS noninteractive guardian profile. Unsupported platforms expose a fail-closed sentinel.

Application coordinators retain snapshot construction, cloning policy, revisions, persistence
semantics, validation, commands, route classification, response documents, worker protocols, and
terminal behavior. `setta-runtime` retains application registration, packaging, live identity
verification, and outer native-server supervision.

Review and Experiment Lens use `projectfs` for immutable project inputs and their revisioned state
files. Realtime uses it for its project document and for staging the declared entrypoint before the
application-owned version recheck. Streaming content stores, retained materializations, and worker
artifact staging keep their domain-specific byte and identity transactions. Python Canvas keeps its
authored/generated-file transaction application-owned because provider synchronization and
generated-file rollback span the authored commit; `projectfs` does not pretend that multi-file
protocol is an ordinary single-file replacement.

`latestvalue` holds only detached complete values and subscriber lifecycle. Review and Experiment
Lens use it below their state-to-snapshot coordinators, Realtime uses it for authored-project
snapshots, and Python Canvas uses it for coordinator snapshots. Realtime runtime envelopes retain
their application-owned bounded event stream because overflow deliberately discards queued events
and sends a resynchronizing runtime snapshot, which is not latest-value publication.

`httpjson` recognizes the parsed `application/json` media type, applies the caller's request-byte
bound before strict decoding, writes one newline-terminated response with the canonical
`application/json; charset=utf-8` type, and owns `Allow` header mechanics for method checks. `sse`
checks flush capability and owns standard no-cache, keep-alive, anti-buffering headers, optional
event names, JSON data framing, initial and per-event flushes, and termination with the request
context or source channel. The application obtains the stream and maps failures before transport
starts; `latestvalue` supplies initial-current and coalescing semantics.

`proctree` does not construct application commands or decide when work is cooperative, timed out,
restarted, or reported. Python Canvas keeps its runner and terminal as distinct lifecycle owners;
the terminal retains identity-aware session cleanup above the shared subreaper and Job Object
primitives. Realtime retains its worker release barrier, protocol shutdown, and complete-worker
replacement policy. The package uses direct standard-library operating-system calls, so this
boundary introduces no third-party process supervisor or system-binding dependency.

## Verification

The module's quick suite uses temporary roots, local listeners, and deterministic helper
processes. It covers hostile paths and headers, concurrent and partial failure, slow subscribers,
strict transport rejection, bounded cancellation, and idempotent cleanup. Each application keeps
small boundary tests for its route wiring and product invariants. Native servers build from their
ordinary module roots with read-only resolution, and wheel staging contains only compiled servers
and admitted web assets.
