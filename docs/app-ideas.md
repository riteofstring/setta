# Setta Workspace Product Directions

## Purpose

Setta currently has two applications built on `@setta/workspace`:

- Python Canvas turns Python callables, parameters, lists, generated code, diagnostics, and local
  execution into a durable visual project.
- Realtime connects authored interfaces to ordinary Python handlers and presents live pipelines,
  streamed results, retained outputs, and artifacts.

Both applications expose strict machine-readable CLI boundaries as well as visual interfaces. That
combination is central to future products: agents should be able to prepare, inspect, and hand off
work without reproducing human UI gestures, while the UI should make relationships, evidence, and
judgment easier for people to understand.

This document evaluates possible next applications. It is an ideas document, not an implementation
plan.

Setta is not an AI agent harness. A person can use Codex, Claude Code, OpenCode, another agent, a
script, or another application outside Setta and exchange ordinary files through the same
documented CLI boundary. None of the recommended apps should own a model session, supervise an
agent loop, proxy tool calls, or require a particular provider SDK.

## Selection standard

A new standalone application should satisfy all of the following:

1. **Reuse dormant Setta strengths.** It should recover a small, coherent subset of capabilities
   from historical `main` or use Workspace capabilities that neither current application exercises.
2. **Own one durable concept.** Its source of truth and lifecycle must differ from a Python project
   or a live handler graph.
3. **Remain deliberately small.** A useful first version must not require a general agent runtime,
   workflow engine, distributed scheduler, secret vault, crawler, vector database, or collaboration
   platform.
4. **Work naturally with agents.** Agents and arbitrary applications should be able to create its
   inputs and consume its outputs through documented files and CLI contracts.
5. **Reserve human effort for judgment.** The app should automate collection and bookkeeping while
   making comparison, review, taste, or authority decisions pleasant and legible.
6. **Have a differentiated interaction.** Removing Workspace's real content, relationships,
   attention, Inspector, managed windows, or saved presentations should materially weaken it.
7. **Avoid commodity categories.** A familiar ingredient is acceptable, but the recurring job and
   durable record should not amount to another generic dashboard, chat client, file browser, or
   node editor.

The practical ranking is:

`unused leverage + portability + recurring value + differentiation - integration burden - correctness burden`

## Capability landscape

The local `main` branch at commit `043d3b2e9c69caf99d1246f1408b3ad7194b7864` contained several
coherent capability clusters that the current applications do not use:

- agent profiles, engine selection, MCP tool allowlists, scoped agentic edges, and agent-context
  extraction;
- persisted agent-run inputs, outputs, events, tool calls, cost, status, branching, and run chains;
- AI Follow, which connected active tool arguments back to referenced sections;
- project and section chats, questions, tool previews, and approval requests;
- parameter sweeps, variants, run plans, logs, metrics, and detached execution;
- Git status, diffs, history, commit details, and worktree summaries;
- file browsing, universal previews, spreadsheets, text, code, images, charts, and attachments; and
- artifact storage, imports, downloads, and provenance-related metadata.

The current branch also contains Workspace capabilities that are available but not yet used by
Python Canvas or Realtime as product features:

- multi-section attention and programmatic framing;
- managed floating, docked, minimized, and maximized windows;
- named Window Spaces and standalone Window Space surfaces;
- standalone section and subtree surfaces;
- the global Find and command-palette navigator; and
- local or delegated structural history.

Python Canvas already demonstrates generated code, diagnostics, terminals, typed controls, saved
views, and revision-bound agent-friendly mutations. Realtime already demonstrates controlled
graphs, live events, bounded scheduling, streaming results, retained artifacts, drawing, and direct
invocation. A new application should not merely recombine those same behaviors under another name.

Historical code is evidence and a behavioral reference, not a drop-in product platform. The old
agent, run, Git, file, and preview systems were integrated with a much broader application model.
Recovering a narrow capability can reduce discovery risk, but a new app still needs its own small
contract, persistence boundary, and failure semantics.

## Portfolio assessment

Each score is out of five. A higher **Simplicity** score means a smaller, easier-to-bound first
version.

| Product boundary                    | Leverage | Simplicity | Agentic value | Novelty | Decision                  |
| ----------------------------------- | -------: | ---------: | ------------: | ------: | ------------------------- |
| Setta Review                        |        5 |          4 |             5 |       4 | Build first               |
| Setta Context Pack                  |        5 |          4 |             5 |       4 | Build second or alongside |
| Independent Setta Permit            |        5 |          2 |             5 |       4 | Do not split yet          |
| Agent Context and Replay Bench      |        5 |          2 |             5 |       4 | Defer                     |
| Multi-format general evidence audit |        5 |          2 |             5 |       3 | Defer generalization      |
| Generic evaluation dashboard        |        4 |          2 |             4 |       1 | Do not build              |
| Generic visual runbook              |        4 |          1 |             2 |       1 | Do not build              |
| Broad investigation workspace       |        5 |          1 |             3 |       2 | Do not build              |
| Generic MCP inspector               |        3 |          4 |             4 |       1 | Do not build as an app    |

The recommended portfolio contains **two applications**, not four. Setta Review owns immutable
requests and review responses. Setta Context Pack owns authored, revisable context bundles. They
share provenance and portable-file conventions, but their mutation rules and durable records are
different.

| Boundary         | Setta Review                            | Setta Context Pack                 |
| ---------------- | --------------------------------------- | ---------------------------------- |
| Canonical record | Frozen request plus separate response   | Authored, versioned context bundle |
| Primary action   | Decide without rewriting the submission | Add, remove, and scope sources     |
| Main output      | Review Response                         | Materialized bundle and manifest   |
| Typical moment   | A producer needs judgment or authority  | A consumer needs bounded context   |

## Recommended flagship: Setta Review

Open the [Completion](setta-product-mockups.html#review-completion),
[Choice](setta-product-mockups.html#review-choice),
[Candidate](setta-product-mockups.html#review-candidate), or
[Permission](setta-product-mockups.html#review-permission) review mockup.

Setta Review should be a **visual review and response app for work prepared by agents, applications,
scripts, or people**. Its recurring question is:

> What is being claimed, asked, or proposed; what material supports it; and what structured
> decision should return to the producer?

The producer creates an immutable review request containing a requested decision, typed subjects,
evidence or context references, artifacts, and provenance. Review resolves the material, presents
the appropriate Workspace view, and records a response without silently rewriting the request.
Codex, Claude Code, OpenCode, or any other producer can submit and consume the same ordinary files.

### Durable concepts

- A **review request** is an immutable description of what the producer wants reviewed.
- A **review type** defines bounded subject and decision semantics. Types are built into the app;
  the first version is not a generic form or plug-in builder.
- A **subject** is the claim, question, option, candidate, or capability being considered.
- An **evidence reference** points to an exact Git hunk, text or log range, JSON result, local file,
  or content-addressed artifact.
- A **review response** records decisions, qualifications, rationale, selected artifacts, unresolved
  items, and provenance without mutating the submitted request.
- A **continuation packet** is an optional response presentation for the next person, agent, or
  application.

### Typed review workflows

#### Completion review

Completion review presents bounded completion claims beside exact evidence and can ingest
independent assessments from any external agent. Consensus recedes; disagreements, missing
evidence, and consequential claims receive attention so a person can resolve only the exceptions
that require human judgment. Its response can become a continuation packet for the next consumer.

#### Choice review

A producer submits a bounded decision with explicit options, an optional recommendation, evidence,
and an expected response shape. The reviewer selects, rejects, or requests revision and can attach
conditions or rationale. Open-ended questions stay in ordinary conversations. The external
producer owns its session and decides how to continue after reading the response packet; Review
never resumes an agent.

#### Candidate review

Managed windows provide synchronized comparison of images, text, JSON, or other admitted
artifacts. The response records a selection, ranking, rejection, or qualification and can include
the chosen artifacts.

#### Permission review

Permission review compares a submitted tool catalog or proposed policy with normalized traces and
lets a reviewer allow, narrow, or deny capabilities. The response is advisory unless an external
consumer explicitly validates and enforces it.

### Why Workspace matters

- Real subjects, evidence, and options remain visible together instead of becoming abstract task
  labels.
- Typed edges show which evidence supports a claim, which option a risk affects, or which calls
  motivate a permission.
- Attention and framing bring every source for the selected subject into view.
- Managed windows make candidate, diff, log, artifact, and proposal comparison a first-class
  interaction.
- Saved views can provide Request, Evidence, Compare, and Response presentations over one record.
- Inspector controls can record a small decision without turning the product into a form builder.

Historical questions, approval cards, agent-run events, tool calls, Git views, previews,
attachments, artifacts, and AI Follow provide reference behavior. Current Workspace attention,
managed windows, Window Spaces, standalone surfaces, and typed controls provide the presentation
foundation.

### Bounded first version

1. Open one review request and an optional local Git worktree.
2. Support two built-in types: completion review and choice review. Choice review covers bounded
   questions, proposals, and candidate sets with type-specific presentations.
3. Resolve Git hunks, UTF-8 text or log ranges, JSON results, and local file artifacts.
4. Export a versioned review response and optional continuation packet.

The first version does not run or resume an agent, edit source, execute tests, invoke tools, commit
or push Git changes, contact providers, authenticate remote services, or infer whether a claim is
true. Permission review should follow only after the common request and response contracts work in
real handoffs.

## Second application: Setta Context Pack

[Open the Setta Context Pack Build mockup](setta-product-mockups.html#context-pack-build).

Setta Context Pack should create and inspect **portable, exact context bundles**. Its recurring
question is:

> What information will the next agent or application receive, where did it come from, and can the
> bundle be handed off without this app?

An agent or person starts with one task and selects local files, exact text ranges, Git revisions or
diffs, artifacts, and tool-policy references. Context Pack records provenance and materializes a
self-contained bundle that another agent or ordinary program can consume.

### Durable concepts

- A **task** states the requested outcome and constraints.
- A **source reference** identifies exact content by path and revision, range, or content hash.
- A **context relationship** states why a source is included and which task or other source it
  supports.
- A **materialized bundle** contains a manifest plus portable content, rather than links into
  private application state.
- A **bundle revision** records an intentional change to included context without mutating an
  already handed-off revision.

### Existing Setta leverage

Historical file browsing, universal previews, Git reads, attachments, context edges, profiles, and
tool allowlists provide the main ingredients. Workspace graph families, attention, saved views,
standalone surfaces, and typed controls can expose inclusion and provenance without inventing a new
canvas system.

### Bounded first version

1. Create one task or import it through the CLI.
2. Add local UTF-8 files, exact ranges, Git diffs, and admitted file artifacts.
3. Inspect included content, provenance, duplication, missing sources, and bundle size.
4. Export a directory containing a versioned JSON manifest, a readable Markdown summary, and
   materialized content using relative paths and hashes.

The first version has no chat, model execution, embeddings, semantic retrieval, crawling, OCR,
automatic summarization, or provider-specific prompt assembly. It packages context; it does not
decide how a consumer should reason about it.

Context Pack is a prerequisite-shaped product for a later replay bench. It proves exact context
materialization and arbitrary-app handoff before Setta assumes responsibility for running or
comparing agents.

## Possible future third application: Setta Permit

Permission review belongs in Setta Review while it accepts a frozen proposal and emits one response.
Permit becomes a separate product only if it owns durable reusable policies, policy revisions,
schema validation, compatibility reporting, and consumer-specific export adapters. That lifecycle
would be policy authoring rather than proposal review.

Do not pre-emptively split it. First import catalogs and traces as ordinary files and prove the
permission-review workflow. A later split must still avoid invoking tools, starting MCP servers,
storing credentials, executing agents, or claiming to sandbox a process.

## Deferred directions

### Agent Context and Replay Bench

Agent replay remains a strong long-term direction, but it is not a simple first application.
Freezing materialized context, normalizing different agent runtimes, replaying them safely, aligning
event streams, capturing artifacts, and explaining environmental differences together form an
execution platform.

A future agent Bench should consume Context Pack bundles, Review responses, and a proven portable
run envelope. It should not invent all three contracts inside its first release.

### Agent Intervention

A bounded question or approval request belongs in Setta Review. Generic intervention does not:
continuation requires an external host to own a paused run, authorization, tool execution, and a
durable resume token. Review emits a response packet and never claims to resume the producer.

### General Claim Audit

Verifying arbitrary reports against PDFs, spreadsheet rows, log lines, text ranges, image regions,
web pages, and tool results requires several unrelated ingestion and stable-anchoring systems.
Completion review retains the valuable core—claims, exact evidence, decisions, and handoff—while
limiting the evidence types. Generalize only after real packets repeatedly require another stable
anchor type.

## Directions not worth implementing

- **Generic evaluation dashboard:** prompt playgrounds, trace dashboards, metrics, and leaderboards
  are crowded, while reliable evaluation infrastructure is expensive.
- **Generic visual runbook:** scheduling, credentials, retries, recovery, idempotency, and audit
  dominate the implementation, and agents can plan many low-risk steps dynamically.
- **Broad investigation workspace:** ingestion, OCR, indexing, retrieval, entity resolution,
  collaboration, and publishing turn it into a large knowledge platform.
- **Generic MCP inspector:** discovery and invocation are useful features, but they do not create a
  durable product record. A reviewed permission response is the stronger boundary.
- **Generic agent builder:** visual agent graphs and provider configuration are established
  categories and would pull Setta back toward a universal application.

## Cross-application contract

Every selected app should preserve the interoperability pattern established by Python Canvas and
Realtime:

- an offline command that describes its complete input, mutation, and output schemas;
- machine-readable snapshot and revision-bound mutation commands;
- deterministic stdout, stderr, and exit semantics;
- versioned manifests with relative paths, explicit media types, hashes, and optional Git
  revisions;
- no requirement for a model provider merely to create, inspect, or consume the durable record;
- the producing agent remains outside Setta's process boundary and keeps ownership of its session,
  tools, credentials, and execution loop;
- exported bundles that remain useful without Setta installed; and
- deep links as optional conveniences rather than the only way to resolve content.

Shared framing and content-reference conventions are useful, but each app should retain its own
small canonical model. Cross-app handoff should happen through admitted, documented bundles rather
than imports from another app's frontend or backend internals.

## Suggested order

1. Define the smallest open Review Request, evidence-reference, Review Response, and continuation
   envelopes.
2. Build completion review around a real agent or application handoff.
3. Add choice review with question, proposal, and candidate presentations without introducing a
   generic review-type plug-in system.
4. Build Context Pack around exact input-side materialization and reuse compatible bundle framing.
5. Explore permission review using exported catalogs and traces.
6. Split Permit only if durable policy authoring and adapter compatibility become recurring work.
7. Reconsider Bench only after context, evidence, artifacts, and review records already move
   cleanly between independent producers and consumers.

## Product guardrail

Canvas nodes are a representation, not a product thesis. Agent execution is also a capability, not
automatically a product thesis. A new application should own one durable record that agents can
prepare and other software can consume. Its interface should concentrate human attention on the
small amount of visual comparison, judgment, taste, or authority that remains valuable after the
mechanical work is automated.

If an app requires Setta to select a model, maintain an agent conversation, route tool calls, or
resume provider-specific execution, it has crossed the boundary into an agent harness and should
be redesigned around file import and export instead.
