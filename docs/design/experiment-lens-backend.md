# Experiment Lens backend design rationale

This document owns current non-local rationale for the `experiment-lens-backend` module. Public
CLI, project, and file-format behavior belongs in `apps/experiment-lens/README.md`.

## Authority and storage

Experiment Lens is a local read-only explorer, not an experiment runner or tracker. A trusted
project root contains one immutable `experiment.json` manifest, one immutable observation source,
and referenced artifacts. The manifest defines field and artifact semantics plus a declarative
presentation. That presentation selects from Lens's closed section catalog, binds section data, and
defines named views with exact placements and initial viewports. It contains no executable section
code, expressions, arbitrary renderer options, remote locations, dependencies, or commands.

Presentation admission is semantic, not merely structural. Section and view identifiers are unique;
the initial view and every placement reference exist; every section is placed at least once; and no
view places one section twice. Field bindings must name admitted fields with compatible roles and
types. Timeline and gallery bindings must name admitted relation roles whose artifacts have
compatible media. Counts, coordinates, sizes, zoom, and collection lengths are bounded, and
properties outside a section's discriminated type are rejected before a snapshot reaches the UI.

Opening a project admits the exact manifest and observation bytes, validates every observation
against its declared fields, and records their SHA-256 identities. Mutable selection state lives in
`.local/experiment-lens/state.json`. It is bound to the experiment identity and both admitted
digests, carries one monotonic revision, and contains only durable filters, a focused observation,
the selected comparison basket, selected artifacts, exact artifact ranges, and notes. Hover, chart
zoom, playback position, and window geometry remain frontend state. Every mutation names the
observed experiment identity, both admitted digests, and revision, validates one complete
replacement selection, and atomically replaces the state. Lens never rewrites the manifest,
observations, or artifacts.

Export materializes one versioned selection packet. The packet carries the exact source identities,
filters, selections, selected observation values, ranges, notes, and the artifact references needed
by those selections. It contains project-relative paths and never an absolute project path. Export
revalidates every included artifact so changed evidence cannot enter a packet under an older
identity. Hashes identify immutable experiment input and reusable evidence; they are not used to
detect mutable state changes.

## Artifact boundary

Every input path is relative to the project root, remains within its canonical boundary, and names
a regular non-symlink file through only non-symlink directories. The manifest declares each
artifact's media type, byte length, and SHA-256. Artifact relations connect stable observation and
artifact identities through a semantic role. A presentation can bind timeline or gallery sections
to those roles without embedding paths or renderer behavior in the layout.

Artifact HTTP routes use admitted artifact identities rather than caller-supplied paths. Text,
code, JSON, and the optional `setta-series/v1` JSON envelope are resolved into bounded snapshot
content. Passive images, including SVG used only through an image source, audio, and video use an
exact same-origin sandboxed byte route. Other artifacts remain inert metadata and are available
only as attachments. Lens never inserts artifact markup, renders HTML, executes artifact content,
invokes a subprocess, or fetches a remote URL.

## Local service and commands

The standalone Go backend owns strict contracts, persistence, artifact resolution, HTTP, SSE, and
offline commands. `schema` describes every public manifest, observation source, mutation, snapshot,
selection packet, result, and error document. `snapshot`, `apply`, and `export` use the same
coordinator as the browser. `serve` exposes complete snapshots, revision-checked selection
replacement, packet export, admitted artifact reads, and an SSE stream that begins with current
state and publishes every accepted replacement. The CLI emits deterministic JSON on stdout,
structured JSON errors on stderr, and stable exit semantics.

The service binds loopback, validates its exact origin on mutations, constrains static assets and
project files, and is supervised through the shared Setta runtime. It has no experiment scheduler,
provider credentials, agent process, tracker client, source mutation, arbitrary URL resolver,
dynamic section discovery, or plug-in loader.

## Contract generation

Go definitions own the public JSON Schemas. Generated TypeScript declarations and standalone Ajv
validators derive from those schemas and are drift checked. Frontend code accepts only validated
snapshots and command results; it carries no parallel handwritten wire parser.
