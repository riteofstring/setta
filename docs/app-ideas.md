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

| Direction                        | Leverage | Simplicity | Agentic value | Novelty | Decision                    |
| -------------------------------- | -------: | ---------: | ------------: | ------: | --------------------------- |
| Setta Witness                    |        5 |          4 |             5 |       4 | Build first                 |
| Setta Context Pack               |        5 |          4 |             5 |       4 | Build second or alongside   |
| Setta Curator                    |        4 |          5 |             5 |       3 | Strong small prototype      |
| Setta Permit                     |        5 |          3 |             5 |       4 | Explore after interchange   |
| Agent Context and Replay Bench   |        5 |          2 |             5 |       4 | Defer                       |
| Agent Intervention               |        4 |          2 |             4 |       3 | Keep as a future capability |
| Multi-format general Claim Audit |        5 |          2 |             5 |       4 | Fold into Witness           |
| Generic evaluation dashboard     |        4 |          2 |             4 |       1 | Do not build                |
| Generic visual runbook           |        4 |          1 |             2 |       1 | Do not build                |
| Broad investigation workspace    |        5 |          1 |             3 |       2 | Do not build                |
| Generic MCP inspector            |        3 |          4 |             4 |       1 | Do not build as an app      |

## Recommended flagship: Setta Witness

Setta Witness should be an **evidence-backed completion and handoff reviewer**. Its recurring
question is:

> What does this producer claim it completed, what exact evidence supports those claims, and what
> should the next person, agent, or application receive?

A producer can be an AI agent, a Setta application, a script, or a person. It creates a portable
completion packet containing a requested outcome, completion claims, evidence references,
artifacts, unresolved work, and provenance. Witness resolves those references, presents each claim
beside its evidence, and records a review without rewriting the producer's record.

### Durable concepts

- A **completion packet** is an immutable statement of what one producer is handing off.
- A **claim** is a bounded assertion such as “implemented the requested behavior,” “this check
  passed,” or “this artifact is the final output.”
- An **evidence reference** points to an exact Git hunk, text or log range, tool result, local file,
  or content-addressed artifact.
- A **review decision** marks a claim supported, contradicted, unproven, or intentionally accepted
  with a qualification.
- A **continuation packet** combines the original request, accepted evidence, unresolved claims,
  and a concise next-work description for another consumer.

### Why Workspace matters

- Claims and real evidence remain visible together instead of becoming labels on abstract nodes.
- Evidence edges show which claims depend on which files, logs, results, and artifacts.
- Selecting a claim can frame and apply attention to every cited section.
- Managed windows can place a diff, log, artifact, and claim review side by side.
- Saved views can provide Summary, Evidence, and Handoff presentations over the same packet.
- A standalone surface can show one review decision without exposing the entire workspace.
- Inspector controls can record a small decision and qualification without creating a form-heavy
  workflow.

### Existing Setta leverage

Historical agent-run events, tool calls, Git status and diff views, file previews, attachments,
approval cards, artifacts, and AI Follow provide reference implementations for most of the visible
ingredients. Current Workspace attention, managed windows, Window Spaces, text and code sections,
and strict host ownership provide the presentation foundation.

### Bounded first version

1. Open one completion packet and an optional local Git worktree.
2. Resolve evidence references to Git hunks, UTF-8 text or log ranges, JSON tool results, and local
   file artifacts.
3. Review each claim as supported, contradicted, unproven, or qualified.
4. Export a review record and continuation packet in an open, documented format.

The first version does not run an agent, edit source, execute tests, commit or push Git changes,
contact CI providers, authenticate remote services, or infer whether a claim is true. Agents may
prepare claims and evidence automatically; the app exists to make the remaining judgment fast and
inspectable.

Witness is the useful constrained form of Claim Audit. Additional evidence types should be added
only when they can provide stable, exact anchors. General PDF, spreadsheet, image-region, web, and
semantic citation systems are not part of the first product.

## Second direction: Setta Context Pack

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

## Small visual product: Setta Curator

Setta Curator should be a **candidate artifact review and selection app**. Its recurring question is:

> Which candidate should continue downstream, and what useful judgment explains that choice?

An agent or application writes a manifest and a set of candidate artifacts. Curator presents them
in synchronized managed windows, lets a reviewer select, reject, rank, or briefly qualify them, and
exports the chosen artifacts with a machine-readable decision.

Historical artifacts, attachments, universal previews, run metadata, and file browsing provide the
content foundation. Managed windows and Window Spaces make side-by-side inspection a core product
interaction rather than incidental layout.

The first version supports one candidate set containing bounded images, UTF-8 text, or JSON. It
does not generate candidates, manage a long-lived asset library, edit media, infer a winner, or
provide collaboration. A producer can populate the complete input without UI work, while a person
can contribute taste or domain judgment quickly. The selected artifact and decision manifest are
ordinary files that any downstream tool can consume.

Curator is the smallest proposed application and the best choice when implementation risk and a
visually enjoyable experience matter more than exercising the complete historical agent stack.

## Focused policy product: Setta Permit

Setta Permit should be a **trace-derived tool-permission workbench**. Its recurring question is:

> Which capabilities did this work actually require, which risky capabilities remain exposed, and
> what portable policy should govern the next run?

Permit imports a tool catalog, one or more normalized tool-call traces, and an optional existing
policy. It distinguishes available, observed, attempted, and denied operations; presents argument
and resource scopes; and lets a reviewer export a smaller approved policy.

### Durable concepts

- A **tool catalog snapshot** records names, schemas, metadata, and source identities.
- An **observed use** records the exact tool, arguments, result class, and originating trace.
- A **policy decision** allows, denies, or narrows one capability with a reason.
- A **portable policy** is a provider-neutral record with optional adapters for particular agents.

Historical MCP discovery, tool metadata, profiles, allowlists, agent-run tool calls, previews, and
approval surfaces provide unusually strong leverage. Workspace attention can connect a policy row
to representative calls and affected resources.

The first version imports catalogs and traces but does not invoke tools, start MCP servers, store
credentials, execute agents, or claim to sandbox a process. Its main design risk is expressing
resource and argument constraints without pretending that every agent runtime can enforce them.
Permit should follow the portable packet work in Witness and Context Pack rather than define a
second incompatible interchange system.

## Deferred directions

### Agent Context and Replay Bench

Agent replay remains a strong long-term direction, but it is not a simple first application.
Freezing materialized context, normalizing different agent runtimes, replaying them safely, aligning
event streams, capturing artifacts, and explaining environmental differences together form an
execution platform.

The current ideas document previously described Bench as agent-context counterfactual replay, while
the existing `docs/plans/setta-bench.md` describes a domain-neutral comparison of repeatable local
code executions. Those have different durable concepts and should not share an implementation
until one is explicitly selected.

A future agent Bench should consume Context Pack bundles, Witness completion packets, and a proven
portable run envelope. It should not invent all three contracts inside its first release.

### Agent Intervention

Intervention is valuable at a real authority boundary, but generic continuation is harder than
presenting an approval card. The host must own a paused run, authorization, decision persistence,
tool execution, and a durable provider-specific or provider-neutral resume token.

Keep Intervention as a Workspace presentation capability once an actual application exposes that
pause-and-resume contract. Do not create a standalone app or add an agent runtime merely to produce
approval requests for it.

### General Claim Audit

Verifying arbitrary reports against PDFs, spreadsheet rows, log lines, text ranges, image regions,
web pages, and tool results requires several unrelated ingestion and stable-anchoring systems.
Witness retains the valuable core—claims, exact evidence, review decisions, and handoff—while
limiting the evidence types. Generalize only after real packets repeatedly require another
well-defined anchor type.

## Directions not worth implementing

- **Generic evaluation dashboard:** prompt playgrounds, trace dashboards, metrics, and leaderboards
  are crowded, while reliable evaluation infrastructure is expensive.
- **Generic visual runbook:** scheduling, credentials, retries, recovery, idempotency, and audit
  dominate the implementation, and agents can plan many low-risk steps dynamically.
- **Broad investigation workspace:** ingestion, OCR, indexing, retrieval, entity resolution,
  collaboration, and publishing turn it into a large knowledge platform.
- **Generic MCP inspector:** discovery and invocation are useful features, but they do not create a
  durable product record. Permit's reviewed policy is the stronger boundary.
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
- exported bundles that remain useful without Setta installed; and
- deep links as optional conveniences rather than the only way to resolve content.

Shared framing and content-reference conventions are useful, but each app should retain its own
small canonical model. Cross-app handoff should happen through admitted, documented bundles rather
than imports from another app's frontend or backend internals.

## Suggested order

1. Define the smallest open completion, evidence-reference, review, and continuation envelopes for
   Witness.
2. Build one complete Witness flow around a real agent or application handoff.
3. Build Context Pack around exact input-side materialization and reuse compatible bundle framing.
4. Prototype Curator when a visually rich, low-risk sibling app is desirable.
5. Explore Permit using real tool traces and enforcement capabilities.
6. Reconsider Bench only after context, evidence, artifacts, and run records already move cleanly
   between independent producers and consumers.

## Product guardrail

Canvas nodes are a representation, not a product thesis. Agent execution is also a capability, not
automatically a product thesis. A new application should own one durable record that agents can
prepare and other software can consume. Its interface should concentrate human attention on the
small amount of visual comparison, judgment, taste, or authority that remains valuable after the
mechanical work is automated.
