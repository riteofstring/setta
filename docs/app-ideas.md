# Setta Workspace Product Directions

## Purpose

Setta currently has two applications built on `@setta/workspace`:

- Python Canvas turns Python callables, parameters, lists, generated code, diagnostics, and local
  execution into a durable visual project.
- Realtime connects authored interfaces to ordinary Python handlers and presents live pipelines,
  streamed results, retained outputs, and artifacts.

This document identifies the next product direction by balancing implementation effort, user
reward, novelty, and relevance to modern agentic work. It is an ideas document, not an
implementation plan.

## Selection standard

A new standalone application must do more than arrange visual nodes. It should satisfy all of the
following:

1. **Reuse expensive Setta capabilities.** The product should combine several existing strengths
   from Workspace or the historical `main` application instead of rebuilding commodity
   infrastructure.
2. **Own a distinct durable concept.** Its source of truth and lifecycle must differ from a Python
   project or a live handler graph.
3. **Become more valuable as agents improve.** The product should help people inspect, compare,
   constrain, or verify increasingly capable agents rather than encode work an agent can plan more
   flexibly itself.
4. **Have a defensible interaction advantage.** Removing Workspace's sections, context edges,
   saved views, attention, Inspector, or managed windows should materially weaken the product.
5. **Admit a bounded first version.** The useful loop must not require a distributed scheduler,
   secret vault, crawler, vector database, evaluator marketplace, or general workflow engine.

The practical ranking is:

`existing leverage + recurring value + agentic relevance + differentiation - infrastructure burden - correctness burden`

Popularity alone is not evidence of value. A crowded category receives a strong penalty unless
Setta supports a substantially different recurring job.

## Historical leverage

The local `main` branch at commit `043d3b2e9c69caf99d1246f1408b3ad7194b7864` contained several
coherent capability clusters worth recovering selectively:

- agent profiles, model and engine selection, MCP tool allowlists, and scoped agentic edges;
- persisted agent-run inputs, outputs, events, tool calls, cost, status, branching, and run chains;
- AI Follow, which connected agent activity back to the sections it referenced;
- parameter sweeps, variants, run plans, logs, metrics, artifacts, and detached execution;
- project and section chats, questions, tool previews, and approval requests;
- Git status, diffs, history, and worktree summaries;
- file browsing, universal previews, spreadsheets, text, code, images, charts, and attachments;
- saved canvas views, standalone section surfaces, floating windows, and Window Spaces.

The goal is not to reconstruct the former universal application. A focused product should select a
small combination whose value compounds.

## Portfolio decision

| Direction                      | Product boundary                     | Effort      | Reward | Novelty     | Decision              |
| ------------------------------ | ------------------------------------ | ----------- | ------ | ----------- | --------------------- |
| Agent Context and Replay Bench | Experiments and immutable agent runs | Medium      | High   | Medium-high | Build first           |
| Agent Intervention             | Cross-app review and resume state    | Medium      | High   | Medium-high | Add as a capability   |
| Claim Audit                    | Claims, citations, and review state  | Medium-high | Medium | Medium-high | Prototype after Bench |
| Generic evaluation dashboard   | Metrics and leaderboards             | High        | Medium | Low         | Do not build          |
| Generic visual runbook         | Workflow definitions and executions  | Very high   | Medium | Low         | Do not build          |
| Broad investigation workspace  | General research corpus              | Very high   | Medium | Low-medium  | Do not build          |
| Generic MCP inspector          | Tool discovery and invocation        | Low         | Medium | Low         | Keep as a feature     |

Effort is relative to capabilities already present in Setta. Novelty describes the proposed Setta
workflow, not whether individual ingredients exist elsewhere.

## Recommended flagship: Setta Bench

[Open the Setta Bench visual walkthrough](setta-bench.html).

Setta Bench should be an **agent context and counterfactual replay lab**, not a general experiment
platform. Its recurring question is:

> Why did this agent behave differently, and can I reproduce the difference?

A user starts from a real task or previous agent run, freezes the exact task, context, profile,
model, tool permissions, and source revisions, changes one controlled variable, and replays it.
Bench then aligns the two event streams, tool calls, outputs, costs, timings, failures, and artifacts
so the user can record a decision with evidence.

### Durable concepts

- A **case** is one task and its expected constraints, not merely a prompt string.
- A **context snapshot** records exactly which section content and source revisions the agent could
  see and how each context edge was materialized.
- An **agent configuration** records engine, model, profile, permissions, tools, and run parameters.
- An **agent run** is immutable evidence: input snapshot, streamed events, tool calls and results,
  output, usage, cost, timing, errors, artifacts, and lineage.
- A **comparison decision** records what changed, representative differences, and why one behavior
  was accepted.

### Why Workspace matters

- Text, code, structured-item, and application-specific sections hold real task and context
  material rather than labels for abstract nodes.
- Agentic edges make context inclusion and materialization visible and editable.
- Typed controls expose model, profile, permissions, tools, and replay variables without requiring
  configuration files.
- Diagnostics mark missing context, invalid tools, stale sources, or incomparable runs in place.
- AI Follow and multi-section attention connect a selected agent event to the material it used.
- Saved views provide Configure, Trace, and Compare perspectives over the same document.
- Managed windows and Window Spaces support synchronized trace and result comparison.
- Standalone section surfaces can present one case, run, or decision without inventing another UI
  system.

### Existing Setta leverage

The historical application already implemented most of the expensive ingredients: agent profiles,
managed and external agents, MCP discovery and calls, tool allowlists, conversation branches,
persisted agent events, cost and status, run chains, RunPlan variants, artifacts, and AI Follow.
Bench should recover only the subset required for reproducible comparison.

### Bounded first version

1. Select one existing agent run or author one task case.
2. Freeze its context, profile, model, tool allowlist, and source revisions.
3. Fork the run with exactly one declared change.
4. Replay both configurations locally.
5. Compare aligned output, tool calls, events, usage, and artifacts.
6. Save a short decision and the two immutable run identities.

The first version has no optimizer, distributed workers, hosted evaluator marketplace, arbitrary
workflow graph, synthetic dataset generator, or generic observability dashboard. Fixed checks may
score explicit outcomes, but the product center is explainable behavioral difference.

## Cross-app capability: Agent Intervention

[Open the Agent Intervention visual walkthrough](agent-intervention.html).

Agent Intervention should begin as a Workspace capability used by Python Canvas and Bench, not as a
standalone runbook application. Its recurring question is:

> What is this agent asking to do, what would it affect, and how should it continue?

An intervention binds one paused agent run to an exact proposed tool call or mutation, its
arguments, relevant context, affected files or resources, risk annotations, and the eventual human
decision. A reviewer may approve, reject, or narrow the request, add a note, and resume the same
run. The decision remains part of the run record.

Workspace contributes an intervention queue pane, multi-section attention for affected material,
a focused standalone decision surface, typed Inspector controls, and a managed run window after
resume. The host application owns the paused run, authorization, decision persistence, tool
execution, and continuation.

The historical application already streamed external-agent questions, approval requests, tool
previews and results, persisted agent events, and exposed Git diffs and worktree state. The new work
is a coherent review model and presentation, not a workflow runtime.

Agent Intervention explicitly excludes authored runbooks, generic DAGs, schedules, retries,
credentials, remote workers, and infrastructure orchestration. It should become a standalone app
only if users develop a durable cross-project review queue and collaboration lifecycle that cannot
belong to the originating application.

## Constrained prototype: Claim Audit

[Open the Claim Audit visual walkthrough](claim-audit.html).

Claim Audit should verify an agent-produced report against already available local evidence. It is
not a general research, note-taking, or knowledge-graph application. Its recurring question is:

> Which claims in this output are supported by exact source material, contradicted, or still
> unverified?

A claim owns its quoted report text, status, reviewer decision, and citations. Each citation resolves
to an exact location in a source already present in the workspace, such as PDF pages, spreadsheet
rows, log lines, text ranges, images, or tool results. Agents may suggest claims and citations;
people accept, qualify, reject, or leave them unresolved.

Workspace makes source material and claims simultaneously inspectable through real content
sections, data and agentic edges, multi-section attention, saved views, managed windows, and Window
Spaces. Historical file browsing, universal previews, spreadsheets, attachments, agentic context,
and AI Follow provide the expensive starting pieces.

The prototype accepts existing local sources and one existing report. It excludes crawling, OCR,
web research, embeddings, general retrieval, entity resolution, collaborative knowledge graphs,
and automatic truth scores. Claim Audit may begin as a Bench review workflow; it should become a
standalone app only if claims and citations prove to be a durable source of truth across many runs.

## Rejected directions

### Generic visual runbook

Static workflow authoring is crowded, and production-grade execution requires disproportionate
work in scheduling, idempotency, credentials, retries, recovery, concurrency, and audit. Agents can
also plan many non-sensitive steps dynamically. Setta should expose human intervention at real
authority boundaries rather than build another workflow engine.

### Broad investigation workspace

A general research canvas quickly expands into ingestion, OCR, indexing, retrieval, entity
resolution, synchronization, collaboration, and publishing. Many mature note, canvas, and AI
research products already occupy that space. Exact claim auditing is the smaller and more agentic
job.

### Generic agent builder or evaluation dashboard

Visual agent graphs, prompt playgrounds, trace dashboards, and metric leaderboards are established
categories. Setta's opportunity is not another box-and-arrow builder or trace viewer. It is the
combination of editable context, exact run snapshots, counterfactual replay, spatial attention, and
human decisions.

## Suggested order

1. Build the smallest complete Setta Bench loop around one real agent task and one-variable replay.
2. Add Agent Intervention to Bench or Python Canvas when a real run pauses for a consequential
   action.
3. Prototype Claim Audit on a Bench-produced report and existing local sources.
4. Promote either capability into another standalone app only after its own durable history and
   recurring workflow are demonstrated.

## Product guardrail

Canvas nodes are a representation, not a product thesis. New products should center durable task,
run, context, decision, claim, and citation records. The canvas is valuable when it keeps real
content and relationships inspectable; it is not valuable merely because boxes can be connected.
