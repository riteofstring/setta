# Setta Bench plan

Status: Proposed

Related: [Setta app ideas](../app-ideas.md) and
[Setta Bench visual walkthrough](../setta-bench.html).

## Decision

Build Setta Bench as a standalone Setta application alongside Python Canvas and Realtime. Bench
will use `@setta/workspace` as its composition and interaction surface while owning an independent
experiment model, execution lifecycle, run ledger, and comparison experience.

The first complete product slice will be a local evaluation workbench. It will support explicit
candidate and configuration matrices, reproducible execution, heterogeneous results, and
side-by-side comparison. An AI evaluation project will be the reference experience, but the
canonical run model will not depend on an LLM provider or on Python-specific experiment semantics.

Bench will integrate with established tools rather than replace them. Hydra may continue to resolve
configuration, Optuna may continue to propose or prune trials, and Python Canvas or Realtime may
provide runnable work. Bench owns the durable record and user experience around those executions.

## Product thesis

Experiment tools are often assembled from a runner, configuration library, tracking store,
notebook, artifact directory, and custom dashboard. The individual pieces work, but the complete
workflow is difficult to operate, reproduce, review, and hand to another person.

Bench turns that workflow into one structured project:

1. Define the candidates, cases, configurations, and evaluation criteria.
2. Validate and launch a frozen run set.
3. Monitor bounded local execution and inspect failures as they happen.
4. Compare metrics and heterogeneous artifacts across runs.
5. Replay an exact run, fork it with a deliberate change, or promote it as a baseline.

The differentiating product is the visible, trustworthy run ledger. The canvas is a way to compose
and understand an experiment; it is not the product by itself.

## Target users and initial job

The initial user is a technical practitioner who repeatedly compares code-backed candidates and
then needs another person to understand or review the result. Examples include:

- evaluating prompts, models, retrieval strategies, or structured-output pipelines;
- comparing image, audio, or document-processing configurations;
- validating data-pipeline changes against representative cases;
- benchmarking multiple Git revisions or command implementations;
- running scientific or engineering parameter studies with mixed outputs.

The initial job is:

> Run a controlled set of candidates against the same evidence, understand the differences, and
> preserve enough provenance for someone else to reproduce the conclusion.

Pure scalar hyperparameter optimization is not the wedge. Existing optimization dashboards are
already effective there. Bench is most useful when results include failures, logs, documents,
media, structured records, human judgment, or operational approval.

## Goals

### Product goals

- Make one experiment understandable from its visible structure.
- Make every launch produce a durable, searchable run set.
- Freeze the complete resolved input and provenance of every run.
- Support bounded execution, progress, cancellation, failure inspection, and restart recovery.
- Compare selected runs across metrics, case results, logs, and artifacts.
- Replay an exact run and fork a run with an explicit change.
- Promote a run as a named baseline without mutating its historical record.
- Provide separate Build, Monitor, and Review presentations over the same experiment.
- Allow a reviewer to understand a result without navigating the complete authoring surface.

### Architectural goals

- Keep Bench domain authority outside `@setta/workspace`.
- Keep the run store separate from authored project state.
- Reuse the existing Setta packaging, foreground supervision, local-origin, and process-lifetime
  boundaries where they apply.
- Use generated frontend contracts for backend-owned domain values.
- Keep the executor protocol language-neutral even when the first reference runner is Python.
- Preserve exact revisions and reject stale authored mutations rather than silently rebasing them.
- Establish a narrow integration contract instead of importing Python Canvas or Realtime internals.

## Non-goals

The first release will not:

- replace Optuna samplers, pruning, or distributed study coordination;
- replace Hydra configuration composition;
- provide a managed cloud training platform or general cluster scheduler;
- provide built-in clients for every model or evaluation provider;
- become a notebook, Python editor, or replacement for Python Canvas;
- become a live interface builder or replacement for Realtime;
- recreate the old all-in-one Setta application or plugin system;
- provide multi-user cloud collaboration, organization administration, or hosted authentication;
- infer experiment quality or automatically promote a winner;
- execute arbitrary code in a sandbox; local executors retain the user's permissions;
- migrate projects or run records from the historical `main` application.

## Product vocabulary

Bench will use a small, explicit vocabulary.

### Project

A local Bench workspace containing authored experiments and presentation state. A project can own
multiple experiments but has one run ledger and content store.

### Experiment

The mutable authored definition of a comparison. It identifies case sets, candidates,
configuration dimensions, evaluators, and an executor. Editing an experiment never mutates runs
that were already launched.

### Case set

A versioned collection of representative inputs and optional expected values or labels. A case set
may be inline for a small fixture or reference an explicitly admitted project file.

### Candidate

One implementation or strategy to evaluate. A candidate may ultimately reference a Python Canvas
snapshot, Realtime handler graph, local command, provider configuration, or another admitted
executor target. Candidate identity is distinct from display name.

### Evaluator

A rule that turns outputs into observations. Evaluators may produce scalar metrics, structured
findings, pass/fail assertions, or requests for human judgment. A human rating is an observation,
not a mutation of the original executor output.

### Run set

One user launch. It freezes the selected experiment revision and expands the chosen candidate and
configuration matrix into ordered runs. A run set owns aggregate status and cancellation but does
not erase completed child runs.

### Run

One resolved candidate and configuration applied to the selected case set and evaluators. A run
owns terminal status, provenance, case results, metrics, logs, artifacts, and lineage.

### Comparison

A selected set of immutable runs presented together. Comparison presentation may be ephemeral in
the first slice; named durable comparisons can follow after the run ledger is stable.

### Baseline

A movable project label pointing to one immutable run. Promoting a new baseline moves the label and
does not rewrite either run.

## Core experience

### Build

The Build presentation uses the Workspace canvas to show the experiment's important parts and
their relationships. The user can locate case sets, candidates, configuration, evaluators, and
reports without reading an implementation file. The Inspector exposes the selected object's valid
settings and validation feedback.

The canvas will avoid representing every case or run as a node. Those are dense collections and
belong in purpose-built list and table surfaces. The canvas represents experiment structure only.

### Validate and launch

Before launch, Bench resolves the selected experiment into a complete preview: candidate matrix,
case-set identity, evaluator identity, executor, expected run count, and any blocking diagnostics.
Launch is one revision-bound action. Acceptance creates the frozen run set before any executor can
start so partial startup cannot produce unowned work.

### Monitor

The Monitor presentation centers the run ledger. It shows queued, running, completed, failed, and
canceled runs; bounded progress; important messages; durations; and aggregate run-set status.
Selecting a run reveals its resolved inputs, provenance, logs, case progress, and artifacts without
changing the experiment definition.

### Compare

The comparison experience supports a small deliberate run selection rather than rendering every
run at once. It aligns common metrics, makes missing observations explicit, and exposes representative
case disagreements. Media, documents, logs, and structured outputs can open in Workspace-managed
windows so a reviewer can build and save an effective comparison arrangement.

### Replay, fork, and promote

Replay submits the exact frozen run specification again and records a lineage link. It does not
quietly substitute the latest experiment or source revision. If an external input is unavailable,
replay fails visibly.

Fork starts from one run's frozen specification, applies an explicit user-authored change, and
creates a new run set with parent lineage. Promote moves a named baseline pointer only after the run
is terminal and eligible under project policy.

## Workspace composition

`@setta/workspace` will remain a generic UI package. Bench will compose its public surfaces rather
than add experiment semantics to Workspace.

### Canvas

The canvas presents experiment structure through Bench-owned section kinds and Workspace's
controlled graph boundary. Data edges describe value or artifact flow. Workflow edges describe
execution order only when order is meaningful. Bench validates domain relationships before
projecting ports and edges.

### Shell panes

- The built-in Outline navigates experiment sections.
- Saved Views manages Build, Monitor, Review, and user-authored canvas presentations.
- A Bench-owned Experiments pane selects and manages experiments.
- A Bench-owned Runs pane provides the searchable ledger and run-set controls.
- The Inspector edits selected authored objects and presents immutable run details contextually.

### Saved views and tabs

The initial project creates Build, Monitor, and Review saved views. They share experiment content
while owning visibility, layout, and viewport. Activating a view never changes run state.

### Managed windows and Window Spaces

Run artifacts, logs, case details, and comparison surfaces may be opened as managed windows. Window
Spaces allow a useful review arrangement to be saved independently of the experiment's canvas
layout. A window never becomes a second authority for run data.

### Standalone surfaces

A focused run report or saved comparison arrangement may use Workspace's standalone surfaces.
Bench owns routing, loading, authorization policy, not-found behavior, and immutable run lookup.

### Commands, Find, and attention

Global Find searches authored experiment names and explicitly safe metadata. The command palette
exposes creation, launch, compare, replay, cancel, and navigation actions only when their current
domain preconditions hold. Runtime attention can focus failing or newly completed experiment
sections without changing canonical selection.

## Authority and state boundaries

Bench will maintain three explicit state classes.

### Authored project state

The backend owns experiment definitions, stable identities, allowed relationships, baseline
pointers, and the durable Workspace presentation envelope. Authored mutations are revision-bound,
validated as a complete candidate, persisted atomically, and published as complete snapshots.

### Run ledger state

The run ledger is runtime-owned and stored separately from the authored project document. A run
record may advance through its lifecycle until it reaches a terminal state. Its frozen
specification, completed outputs, provenance, and lineage are immutable afterward. User annotations
or human ratings are separate append-only observations with their own identity and authoring time.

### Browser-local state

Transient selection, open menus, filters, table sort, draft editors, active comparison selection,
and unsaved window focus remain browser-local unless the product explicitly promotes them to a
named durable object. Browser-local state cannot change what was executed.

Workspace document data may contain Bench identifiers and presentation data, but it will not be
the canonical store for run records, logs, metrics, or binary artifacts.

## Persistence and provenance

The authored project file remains small and reviewable. Run records, logs, indexes, and adopted
artifacts live below a runtime-owned local directory. Large or binary content is referenced by
validated content identity rather than embedded in the authored document.

Every accepted run freezes at least:

- project and experiment identity and revision;
- run-set identity and matrix coordinates;
- resolved candidate, configuration, case-set, evaluator, and executor inputs;
- source identities, including Git commit and dirty-state evidence when available;
- declared environment and toolchain identity without secret values;
- start and completion timestamps, status, and parent lineage;
- bounded logs, structured observations, metrics, and artifact references;
- cancellation, timeout, truncation, or failure information.

Completed records must remain readable after a project restart. Missing external files or executors
must not make historical metadata disappear. Retention and garbage collection will be explicit
project operations and will never silently delete a referenced baseline.

## Execution model

The first executor boundary will be a local child process that receives one frozen portable run
specification and emits bounded structured updates and final results. The protocol will not rely on
shell parsing or Python object serialization. Language-specific convenience adapters can wrap that
boundary.

The coordinator owns:

- deterministic matrix expansion and run ordering;
- bounded queue and concurrency limits;
- process ownership, timeout, cancellation, and descendant cleanup;
- update sequence validation and terminal-state transitions;
- log and message bounds;
- artifact admission into the content store;
- restart recovery for queued and terminal work;
- explicit treatment of work interrupted by coordinator loss.

The executor owns domain computation. It may invoke Hydra, Optuna, model providers, local libraries,
or ordinary application code. Bench records those integrations but does not pretend to replace
them.

The first slice will use explicit candidate and configuration lists. Adaptive optimization may be
added later through an executor or planner integration once deterministic runs, comparison, and
replay are proven.

## Integration boundaries

### Python Canvas

Python Canvas may export a revision-bound runnable candidate to Bench. Bench stores the exported
identity and frozen execution material, then links results back to the originating project and
callable. Python Canvas remains responsible for authoring callables, parameters, generated code,
and diagnostics.

### Realtime

A later integration may treat a revision-bound Realtime project or handler path as a candidate.
Realtime remains responsible for live event handling and materialization; Bench is responsible for
repeatable batch evaluation and comparison.

### Hydra

Hydra remains the configuration composition authority when a runner uses it. Bench records the
fully resolved configuration used by each run and may present declared safe fields as controls.

### Optuna

Optuna remains the study, sampling, and pruning authority when selected. Bench may ingest its trial
identity and observations into the run ledger, while retaining links to the underlying study.
Bench must not represent imported Optuna trials as if Bench proposed them.

All integrations use declared contracts or process boundaries. Bench will not import sibling app
frontend or backend internals.

## Local security and resource boundaries

Bench executes user-selected code locally and unsandboxed. The interface and CLI must state this
clearly before the first launch. Existing Setta process-tree ownership techniques should be reused
so cancellation, timeout, output limits, and supervisor shutdown terminate descendants reliably.

The application will also enforce:

- exact loopback host and same-origin browser checks;
- revision-bound mutations and launch requests;
- regular-file and project-boundary validation for admitted inputs;
- bounded request bodies, logs, observations, queues, and artifact sizes;
- artifact copying and validation before publication;
- explicit environment-variable admission;
- secret-value redaction from logs, snapshots, and provenance;
- non-overlapping run identity and content namespaces;
- no lifecycle scripts or dependency installation during an ordinary run.

Remote provider credentials remain the responsibility of the invoked tool in the first release.
Bench records provider and configuration identities when supplied but never stores secret values in
run records.

## CLI and automation surface

Bench will follow the existing Setta app pattern with an offline schema and explicit live-session
addressing. The intended command families are:

- open or create a Bench project;
- inspect the closed command and operation schema;
- read a complete project and ledger snapshot;
- apply one revision-bound authored mutation;
- validate or preview a run set;
- launch a run set;
- inspect, follow, or cancel runs;
- replay or fork a terminal run;
- export a bounded comparison report.

Exact command names and JSON contracts will be fixed during the contract phase. Automation must
never edit the project or run store directly and must not silently start an implicit long-lived
server.

## Delivery phases

### Phase 0: product and contract proof

- Freeze the vocabulary and the first AI-evaluation reference project.
- Decide the exact local executor update and artifact protocol.
- Define authored project, run-set, run, case-result, observation, and provenance contracts.
- Define bounds, terminal statuses, recovery behavior, and failure semantics.
- Produce static Workspace projections and confirm that experiment structure, ledger, and
  comparison each have one clear home.
- Prove that Hydra and Optuna can integrate without becoming canonical dependencies.

Exit condition: a reviewed contract fixture can describe the complete reference experiment and
four representative terminal runs without ambiguous ownership.

### Phase 1: authored project and Build experience

- Add the standalone Bench app, backend coordinator, frontend contract generation, and packaging
  entrypoint.
- Create, open, validate, atomically save, and reload a local Bench project.
- Render experiment structure in Workspace with Outline, Inspector, Find, commands, and the initial
  Build, Monitor, and Review saved views.
- Support case-set, candidate, configuration, evaluator, and report authoring sufficient for the
  reference project.
- Reject stale writes and invalid complete project candidates.

Exit condition: the reference experiment can be authored, reloaded, and validated without an
executor or synthetic browser-only canonical state.

### Phase 2: executor and run ledger

- Implement deterministic run-set preview and matrix expansion.
- Create the run set durably before starting child work.
- Execute runs with bounded concurrency, progress, logs, cancellation, timeout, artifact admission,
  and process-tree cleanup.
- Persist run records separately from authored project state and recover them after restart.
- Deliver complete snapshots plus ordered runtime updates to the Runs pane.

Exit condition: a four-run reference matrix can complete, fail, cancel, restart, and retain honest
terminal records without orphaned processes or lost artifacts.

### Phase 3: comparison and lineage

- Compare selected terminal runs across metrics and case outcomes.
- Inspect structured outputs, media, documents, logs, and failure details in managed windows.
- Save and restore a representative comparison Window Space.
- Replay an exact run, fork one explicit field, and preserve parent lineage.
- Promote and replace a named baseline without mutating historical runs.
- Export a bounded human-readable comparison report.

Exit condition: a reviewer can reproduce why one reference candidate was preferred and can replay
the supporting run after restarting the application.

### Phase 4: integration adapters

- Add the narrow Python Canvas candidate handoff.
- Demonstrate a Hydra-resolved configuration while preserving Hydra authority.
- Demonstrate Optuna-proposed trials while preserving Optuna study identity and authority.
- Evaluate whether a Realtime candidate contract adds value without coupling the applications.

Exit condition: each admitted integration produces the same complete Bench provenance and comparison
experience without importing sibling internals or changing the core run model.

### Phase 5: packaging and hardening

- Include Bench in the Setta wheel and platform contract.
- Verify installed CLI dispatch, assets, coordinator startup, shutdown, and foreground supervision.
- Establish retention, cleanup, corruption handling, and bounded indexing behavior.
- Verify accessibility, narrow layouts, large ledgers, light and dark appearance, and reduced motion.
- Complete source-linked browser evidence for the reference user journey.

Exit condition: an installed release can create, run, compare, restart, and reopen the reference
project on every supported platform.

## Verification strategy

Every module will have a quick boundary suite, with observable behavior tested against temporary
projects and stores.

### Backend and contract verification

- complete project validation and revision conflicts;
- deterministic matrix expansion and stable run ordering;
- legal lifecycle transitions and terminal immutability;
- append-only observations and baseline-pointer behavior;
- restart recovery and interrupted-run classification;
- queue, concurrency, cancellation, timeout, and process cleanup;
- log, update, request, and artifact bounds;
- path admission, origin enforcement, redaction, and content-store integrity;
- generated frontend and automation contract agreement.

### Frontend verification

- canonical projection of complete project and run snapshots;
- clear separation between authored data, ledger data, and browser-local presentation;
- Build, Monitor, and Review saved-view behavior;
- ledger filtering, selection, status updates, and restart replacement;
- comparison alignment for present, missing, failed, and incompatible observations;
- window handoff and Window Space restoration;
- command availability, diagnostics, focus, attention, and keyboard workflows;
- responsive and accessible behavior without rendering the full ledger as canvas nodes.

### Browser acceptance journey

The primary browser journey will:

1. Create or open the reference AI evaluation project.
2. Inspect and validate two candidates, one case set, two configurations, and evaluators.
3. Preview and launch a four-run set.
4. Observe independent progress, one failure, and three successful artifact-bearing runs.
5. Cancel and replay a representative run.
6. Compare two runs, inspect a disagreement, and save the comparison arrangement.
7. Fork one configuration value and preserve lineage.
8. Promote a baseline, restart the app, and recover the complete ledger and comparison evidence.

The journey must use temporary state and real coordinator behavior. Static fixtures may seed inputs
but cannot stand in for execution, restart, or persistence.

## Performance expectations

- Canvas interaction cost scales with authored experiment sections, not with total runs or cases.
- The run ledger remains usable with at least ten thousand lightweight terminal run records through
  indexed queries and windowed presentation.
- Opening one run does not load unrelated logs or artifact bodies.
- Live updates are bounded and coalesced without losing terminal state.
- Comparison loads only the selected runs and requested case details.
- Artifact previews never require embedding binary content in the Workspace document.

Exact budgets will be established from measured reference fixtures before the relevant phase is
accepted.

## Definition of done

Setta Bench V1 is complete when:

- it installs and launches as a standalone Setta application;
- a user can author and validate the reference evaluation project;
- one revision-bound action creates and launches a frozen run set;
- every run records complete provenance, bounded runtime evidence, and honest terminal status;
- queued and active work can be canceled without leaving owned descendants;
- completed run evidence survives restart independently of authored project state;
- selected runs can be compared across metrics, cases, logs, and artifacts;
- replay uses the original frozen specification and fork records an explicit delta and lineage;
- a baseline can move without rewriting historical records;
- Build, Monitor, and Review presentations remain projections over the same experiment;
- Python Canvas, Hydra, and Optuna integrations preserve their respective sources of truth;
- the application does not require Python Canvas or Realtime internals to explain or run its core
  reference project;
- package, contract, accessibility, process-lifetime, security, browser, and restart verification
  pass under the repository's governed delivery workflow.

## Deliberately deferred decisions

The following decisions should be made only after the first complete run and comparison slice is
measured:

- adaptive search as a native planner versus integration-only behavior;
- durable named comparisons and team annotations;
- human-review queues and blind evaluation modes;
- remote workers or hosted execution;
- project-level retention defaults and content deduplication policy;
- built-in provider clients and credential management;
- multi-user authorship, approvals, and hosted sharing;
- generalized import from third-party experiment trackers;
- whether Realtime projects should be first-class candidates.

Deferral keeps the first release centered on trustworthy local runs and comparison rather than on a
premature experiment-platform feature catalog.
