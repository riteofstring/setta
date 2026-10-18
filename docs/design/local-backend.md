# Local backend design rationale

This document owns current non-local rationale for the `local-backend` module. Product routes,
project formats, commands, and public contracts remain with the consuming application.

## Boundary and dependency direction

`github.com/riteofstring/setta/packages/local-backend` is a standalone, published Go
infrastructure module. It imports no application package and has no knowledge of application IDs,
route versions, project schemas, product state, or readiness documents. Applications supply values
whose product semantics they have already validated.

The module uses the standard library unless a cross-platform primitive requires an already
admitted dependency. A new package must give local tools one complete, reusable contract that
removes duplicated state and failure paths they would otherwise each write; it is not a collection
of similar-looking helpers.

## Security and lifecycle invariants

Trust-boundary checks fail closed and are not caller-disableable. Hosting remains IPv4-loopback
only, admits an exact authority and same-origin mutations, excludes API-like paths from SPA
fallback, and serves only preflighted regular non-symlink assets. File operations remain within a
canonical caller-supplied root, reject symlink traversal and irregular files, bound reads, stage on
the target filesystem, synchronize complete bytes, replace atomically, and synchronize the parent
directory. Mutable local state is compared through authoritative values such as revisions, never
through a newly computed digest.

The native toolchain is pinned to Go 1.26.9 to retain these guarantees on Windows junctions and to
bound standard-library byte-range parsing. The temporary release-age admission and its alternatives
are recorded in [the dependency assessment](../security/dependency-assessment-2026-10-09.md).

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
- `revisionstore` owns one validated JSON state file per store: revision-checked replacement under
  the `projectfs` advisory lock, atomic writes, refresh from durable state after a conflict, and
  `latestvalue` publication of accepted revisions.
- `artifacthttp` owns the closed passive-media allowlist, exact attachment query, sandboxed preview
  headers, and file-response mechanics. Applications retain artifact identity, verified admission,
  routes, and structured errors.
- `proctree` owns only platform descendant containment, bounded termination, wait, and cleanup.
  It creates and assigns kill-on-close Windows Job Objects, revalidates POSIX group identity before
  signaling, adopts and reaps Linux descendants under an explicit deadline, and supplies the fixed
  macOS noninteractive guardian profile. Unsupported platforms expose a fail-closed sentinel.

Applications retain snapshot construction, persistence semantics beyond one state file,
validation rules, commands, route classification, response documents, worker protocols, and
terminal behavior.

`revisionstore` compares revisions, never digests: a replacement names the revision it was derived
from, and the store accepts it only when the durable file still holds that revision. The check and
write happen under the cross-process lock, so two processes cannot both advance the same revision.
A rejected writer refreshes from the durable file and publishes it, so subscribers converge on what
is on disk. The caller's validator runs on every load and replacement; the stored document is the
revision and value only. Multi-file transactions remain application-owned.

`latestvalue` holds only detached complete values and subscriber lifecycle. Event streams that must
retain every event, or that resynchronize after overflow, are not latest-value publication and stay
application-owned.

`httpjson` recognizes the parsed `application/json` media type, applies the caller's request-byte
bound before strict decoding, writes one newline-terminated response with the canonical
`application/json; charset=utf-8` type, and owns `Allow` header mechanics for method checks. `sse`
checks flush capability and owns standard no-cache, keep-alive, anti-buffering headers, optional
event names, JSON data framing, initial and per-event flushes, and termination with the request
context or source channel. The application obtains the stream and maps failures before transport
starts; `latestvalue` supplies initial-current and coalescing semantics.

`artifacthttp` receives only an already opened verified file and admitted metadata. It does not
resolve a caller-supplied path, infer a media type, admit active content, or decide whether a
product exposes a download.

`proctree` does not construct application commands or decide when work is cooperative, timed out,
restarted, or reported; applications own those lifecycle policies above the shared subreaper and
Job Object primitives. The package uses direct standard-library operating-system calls, so this
boundary introduces no third-party process supervisor or system-binding dependency.

## Verification

The module's quick suite uses temporary roots, local listeners, and deterministic helper
processes. It covers hostile paths and headers, concurrent and partial failure, slow subscribers,
strict transport rejection, revision conflicts between independent stores, bounded cancellation,
and idempotent cleanup.

The canonical module path follows the public monorepo location. Go releases use the nested
`packages/local-backend/vVERSION` tag. The module includes its own Apache license for independent distribution.
