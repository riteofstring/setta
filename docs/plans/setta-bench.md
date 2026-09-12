# Setta Bench plan

Status: Proposed, deliberately small

Related: [Setta app ideas](../app-ideas.md) and
[Setta Bench visual walkthrough](../setta-bench.html).

## Decision

Build Setta Bench as a focused local comparison application alongside Python Canvas and Realtime.
Bench will answer one question:

> When the same cases are run through a few implementations, what changed and which result do I
> prefer?

Bench is not intended to become an experiment platform, an MLOps suite, or a general workflow
engine. It is both a useful tool and a reference application showing how `@setta/workspace` can
combine visual structure, bounded local execution, durable history, and side-by-side review.

The data model will be domain-neutral. The first example will compare ordinary image-processing
code rather than depend on an LLM provider or machine-learning vocabulary.

## Place in the sibling suite

Each Setta application should own one understandable job and demonstrate a different interaction
pattern.

| Application   | Primary job                             | Workspace strengths demonstrated                                     |
| ------------- | --------------------------------------- | -------------------------------------------------------------------- |
| Python Canvas | Build and run Python code visually      | Canvas composition, Inspector editing, generated source, diagnostics |
| Realtime      | Connect code to live inputs and outputs | Live state, events, controls, previews, materialized output          |
| Setta Bench   | Compare repeatable code executions      | Run history, progress, dense tables, artifacts, paired review        |

Together the applications support a simple progression: build code, use it interactively, and
evaluate it repeatedly. They remain independently useful and communicate through small explicit
handoffs rather than shared internal state.

## Reference experience

The reference project compares two thumbnail implementations against ten product images:

- **Pillow Canvas** is a revision-bound callable exported by Python Canvas.
- **Sharp CLI** is an ordinary local command.
- **Product images** is a JSONL manifest naming ten project-owned image cases.
- **Shared checks** verify output dimensions and maximum file size while recording duration.
- Each case retains the produced thumbnail as an inspectable artifact.

The user opens the project, confirms the two candidates and ten cases, launches two runs, watches
twenty case executions finish, and compares the same image from both runs. Automatic checks expose
objective differences; the user may record a simple preference and note.

This example is intentionally mundane. It exercises code execution, structured observations,
binary artifacts, provenance, and human review without requiring hosted services or a large domain
framework.

## V1 product contract

### Project

One Bench project contains one comparison experiment and its Workspace presentation. Supporting
multiple experiments inside one project is deferred.

### Candidate

A candidate is one runnable implementation with a stable identity and display name. V1 supports:

- a local command using the Bench process protocol; and
- a frozen runnable exported by Python Canvas through the same protocol.

Bench does not edit candidate code. It records the accepted candidate identity and links back to
its source when one exists.

### Case set

A project has one case set described by a bounded JSONL manifest. Each entry has a stable case ID,
an input value or admitted project file, and optional expected values used by checks.

Cases are rows in a purpose-built surface, not canvas nodes.

### Evaluator

A project may define one shared evaluator. It converts candidate output into a small set of named
observations: numbers, text, or pass/fail findings. Human preference and notes are separate review
observations and never rewrite executor output.

### Run

One run applies one frozen candidate configuration to the complete case set. A launch creates one
run for each selected candidate. Every run records status, timestamps, resolved inputs, bounded
logs, case results, observations, artifact references, and minimal provenance.

Terminal run results are immutable. “Run again” creates a new run from the same stored
specification; V1 does not provide a general branching or lineage editor.

## Core user flow

1. Create or open a Bench project.
2. Add two or more explicit candidates, one case set, and an optional evaluator.
3. Validate the small resolved launch and start it.
4. Inspect queued, running, complete, failed, or canceled runs in the Runs view.
5. Select two terminal runs and compare their metrics and case results.
6. Open representative text, JSON, or image artifacts side by side.
7. Optionally record a preferred run and a short note.
8. Run an existing frozen specification again when another execution is useful.

The application does not automatically select a winner.

## Workspace composition

Bench composes existing Workspace surfaces and keeps experiment semantics outside
`@setta/workspace`.

### Build view

The canvas shows only the experiment's structure: case set, candidates, evaluator, launch, and
results. Workspace section cards, ports, edges, Outline, Inspector, canvas controls, and saved-view
tabs behave the same way they do in the existing applications.

Selecting an authored section exposes its small set of valid fields in Inspector. Validation is
visible before launch. Individual cases and historical runs never become canvas nodes.

### Runs view

A Bench-owned table appears inside a Workspace-managed window. It lists the small durable run
history and shows candidate, origin, status, checks, duration, and selected metrics. The leading
pane navigates launches and runs; Inspector shows immutable details and recent bounded activity.

### Compare view

Two Workspace-managed windows display the selected runs. Common metrics align at the top, and the
same case is shown in each window with its output, findings, and artifact preview. The leading pane
navigates cases with differences. Inspector records the optional preference and note.

Build, Runs, and Compare are saved views over the same project. Their layout is presentation state,
not a second source of experiment truth.

## Execution and persistence

The V1 executor is one local child-process boundary. Bench sends a bounded JSON message for each
case and accepts ordered JSON messages containing progress, output, observations, artifact paths,
or failure details. Language-specific adapters may wrap this contract, but the contract itself is
not Python-specific.

The coordinator owns:

- deterministic candidate and case ordering;
- a small bounded concurrency limit;
- process lifetime, cancellation, timeout, and descendant cleanup;
- bounded output and log collection;
- artifact admission into project-owned runtime storage; and
- honest recovery of terminal records after restart.

The project document contains the authored comparison and Workspace presentation. Run records and
adopted artifacts live separately below a runtime-owned local directory.

Each accepted run freezes only the provenance needed to understand this app:

- project revision and run identity;
- candidate identity, configuration, and source link;
- case manifest and evaluator identity;
- Git commit and dirty-state indicator when available;
- start time, completion time, status, and rerun parent; and
- bounded observations, logs, and artifact references.

V1 does not promise hermetic reproduction of arbitrary local environments.

## Sibling integration

V1 implements one sibling handoff: **Python Canvas → Bench candidate**.

The handoff contains a stable source-project identity, source revision, entrypoint identity, frozen
runnable material, and a deep link back to Python Canvas. Bench copies or validates what it needs
at acceptance time and never imports Python Canvas frontend or backend internals.

A later Realtime integration may export a bounded recorded interaction as a Bench case set. That
work should begin only after both applications can express the handoff without changing their own
canonical models.

No universal Setta project schema or cross-application plugin system is required.

## Explicit non-goals

V1 will not provide:

- hyperparameter optimization, sampling, or pruning;
- native Hydra or Optuna ownership;
- remote workers, cluster scheduling, or managed cloud execution;
- multiple experiments per project;
- production traffic experiments or A/B testing;
- arbitrary dashboards or report builders;
- a general plugin system;
- multi-user collaboration, hosted sharing, approvals, or authentication;
- baseline policies, promotion workflows, or complex lineage graphs;
- searchable organization-wide experiment storage;
- support for every media or scientific data type;
- automatic winner selection; or
- compatibility with historical `main` projects.

Existing tools may still be invoked inside a candidate, but Bench does not model or reimplement
their domain behavior.

## Delivery phases

### Phase 0: freeze the small contract

- Finalize the thumbnail reference fixture.
- Define project, candidate, case, evaluator, run, observation, and artifact records.
- Define the bounded local process messages and failure semantics.
- Confirm the static Build, Runs, and Compare projections using existing Workspace components.

Exit condition: one fixture describes two candidates, ten cases, two terminal runs, and one paired
case comparison without introducing optional platform concepts.

### Phase 1: project and Build view

- Add the standalone Bench package and application entrypoint.
- Create, validate, save, reopen, and revision-check the single-experiment project document.
- Render the structural canvas, Outline, Inspector, controls, and the three saved views.
- Admit local command candidates, a JSONL case manifest, and one evaluator.

Exit condition: the reference project can be authored and reopened with clear validation before an
executor exists.

### Phase 2: local runs

- Preview and launch the explicit candidate list.
- Execute cases with bounded concurrency, progress, cancellation, timeout, and process cleanup.
- Persist terminal run records and admitted artifacts separately from authored state.
- Show the durable history in the Runs view and recover it after restart.

Exit condition: both reference candidates can complete, fail, or be canceled without orphaned work
or dishonest records.

### Phase 3: comparison and one handoff

- Compare two terminal runs and align their shared observations.
- Navigate cases with differences and preview text, JSON, and image results.
- Record an optional preference and note.
- Run an existing frozen specification again.
- Accept the reference Python Canvas candidate and link back to its source.

Exit condition: the complete reference journey works without Hydra, Optuna, remote execution, or a
custom dashboard framework.

## Verification strategy

Implementation verification will stay proportional to the application:

- one quick boundary suite for project validation and persistence;
- one quick boundary suite for process messages, bounds, cancellation, and cleanup;
- one quick boundary suite for terminal immutability and restart recovery;
- focused frontend tests for Build, Runs, Compare, selection, and missing observations; and
- one browser journey using temporary state and the real local coordinator.

The browser journey creates the reference project, launches the two candidates, observes terminal
status, compares one differing image, records a preference, restarts the app, and confirms that the
runs remain readable.

## Definition of done

Setta Bench V1 is complete when:

- it installs and launches as a standalone sibling application;
- one project can define explicit candidates, one case set, and one evaluator;
- one action validates and launches the selected candidates locally;
- run status, bounded evidence, and admitted artifacts remain readable after restart;
- two runs can be compared case by case in Workspace-managed windows;
- the user can record a preference without mutating run output;
- a terminal run specification can be run again;
- one Python Canvas export works through the public handoff; and
- the reference journey remains understandable without explaining an experiment platform.

## Deferred decisions

Only consider these after the complete small application is useful:

- Realtime recording handoff;
- additional executor adapters;
- durable named comparisons;
- richer artifact viewers;
- multiple experiments per project; and
- importing records from third-party trackers.

If a deferred feature does not make the core two-run comparison materially better, it should stay
outside Bench.
