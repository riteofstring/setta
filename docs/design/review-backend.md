# Review backend design rationale

This document owns current non-local rationale for the `review-backend` module. Public CLI,
project, and file-format behavior belongs in `apps/review/README.md`.

## Authority and storage

Review is a local visual decision tool, not an agent runtime. A trusted project root contains one
immutable `review.json` project manifest, immutable request files, and referenced evidence. The
manifest may list multiple requests so one Workspace can show parallel review lanes. Opening a
project verifies and retains the exact request bytes that were admitted; Review never rewrites the
manifest, a request, evidence, source, or an artifact.

Mutable review state lives in `.local/review/state.json`. It contains one monotonic project
revision, imported external assessments, and human response drafts. Every mutation supplies the
project identity and expected revision, validates one complete candidate, and atomically replaces
the state. A conflict never replays against unseen state. Export materializes separate versioned
`review-response.json` and optional `continuation-packet.json` files without changing any input.
Hashes identify immutable requests and admitted evidence; they are not used to detect mutable
Review state changes.

Requests support two closed built-in workflows. Completion requests contain claims and semantic
relations to evidence. Choice requests contain options, factors, tradeoff cells, optional producer
recommendations, candidate artifacts, and semantic relations from factors or options to evidence.
External assessments are separate records carrying the exact subject, assessment, rationale or
caveat, and producer identity as model plus harness. Their absence means only that no assessment
has been recorded.

## Evidence boundary

Every evidence path is relative to the project root, remains within its canonical boundary, and
must name a regular non-symlink file. Git evidence names an exact base revision, optional target
revision or current worktree, path, bounded context, exact hunk, and patch digest. Code references
name a complete UTF-8 file, one supported Workspace CodeMirror language, and its digest. Text and
log references name bounded line ranges plus the complete source-file digest. JSON references name
a file, optional JSON Pointers, and the complete source-file digest. Artifact references name a
media type, byte length, and exact digest. The backend invokes Git without a shell and never
stages, edits, commits, or pushes. If any source changes after request admission, that evidence
becomes a structured resolution failure; Review never substitutes newer bytes into an existing
decision.

Resolved code, bounded text, JSON, and diff data travels in the snapshot. Binary artifacts use an
exact same-origin evidence route keyed by request and evidence identity; callers cannot provide a
path.
Only a closed passive image, audio, and video allowlist renders inline. Other admitted artifacts
remain inert metadata with an attachment-only download route.
Drawing annotations store normalized artifact-relative paths beside the response and bind to the
admitted artifact identity. They never alter source pixels.

## Local service and commands

The standalone Go backend owns strict contracts, persistence, evidence resolution, HTTP, SSE, and
offline commands. `schema` describes every public project, request, assessment, mutation, snapshot,
response, continuation, result, and error document. `snapshot`, `apply`, and `export` use the same
coordinator as the browser. `serve` exposes complete snapshots, revision-checked mutations,
evidence reads, export, and an SSE stream that begins with current state and publishes each
accepted replacement. The CLI emits deterministic JSON on stdout, structured JSON errors on
stderr, and stable exit semantics.

The shared `local-backend/localweb` boundary owns loopback binding, exact listener Host admission,
common response headers, canonical production-asset confinement, SPA fallback exclusion, and
bounded serving shutdown. The shared `local-backend/projectfs` boundary owns canonical-root
handles, confined bounded regular-file access, synchronized atomic replacement, parent-directory
sync, and the state advisory lock. Review retains project admission, immutable evidence identity,
state validation, project/revision conflict rules, and the decision to publish an accepted state.
The shared `local-backend/latestvalue` boundary owns detached initial-current delivery,
non-blocking newest-value coalescing, cancellation, and subscriber close. Review is supervised
through the shared Setta runtime and has no provider credentials, agent process, test runner,
source mutation, remote fetch, arbitrary URL resolver, or plug-in loader.

The shared `local-backend/strictjson` boundary applies the documented lexical rules to project,
state, command, HTTP, and JSON-evidence inputs before Review's closed-shape and semantic checks.
`local-backend/httpjson` owns bounded JSON request and response mechanics, while
`local-backend/sse` frames and flushes Review's named `snapshot` events. Review retains route,
origin, status, structured-error, subscription, and event-name decisions.

## Contract generation

Go definitions own the public JSON Schemas. Generated TypeScript declarations and standalone Ajv
validators derive from those schemas and are drift checked. Frontend code accepts only validated
snapshots and command results; it carries no parallel handwritten wire parser.
