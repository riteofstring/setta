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
Hashes identify immutable request and artifact evidence; they are not used to detect local state
changes.

Requests support two closed built-in workflows. Completion requests contain claims and semantic
relations to evidence. Choice requests contain options, factors, tradeoff cells, optional producer
recommendations, candidate artifacts, and semantic relations from factors or options to evidence.
External assessments are separate records carrying the exact subject, assessment, rationale or
caveat, and producer identity as model plus harness. Their absence means only that no assessment
has been recorded.

## Evidence boundary

Every evidence path is relative to the project root, remains within its canonical boundary, and
must name a regular non-symlink file. Git evidence names an exact base revision, optional target
revision or current worktree, path, and bounded context. The backend invokes the installed Git
executable without a shell and returns a unified diff; it never stages, edits, commits, or pushes.
Text and log references name bounded line ranges. JSON references name a file and optional JSON
Pointers. Artifact references name a media type and exact digest. Missing, changed, malformed,
unsupported, oversized, or digest-mismatched evidence remains visible as a structured resolution
failure instead of disappearing from the review.

Resolved bounded text, JSON, and diff data travels in the snapshot. Binary artifacts use an exact
same-origin evidence route keyed by request and evidence identity; callers cannot provide a path.
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

The service binds loopback, validates its exact origin on mutations, constrains static assets and
project files, and is supervised through the shared Setta runtime. It has no provider credentials,
agent process, test runner, source mutation, remote fetch, arbitrary URL resolver, or plug-in
loader.

## Contract generation

Go definitions own the public JSON Schemas. Generated TypeScript declarations and standalone Ajv
validators derive from those schemas and are drift checked. Frontend code accepts only validated
snapshots and command results; it carries no parallel handwritten wire parser.
