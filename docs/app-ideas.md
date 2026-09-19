# Setta Workspace App Ideas

## Purpose

Setta currently has two implemented applications built on `@setta/workspace`:

- Python Canvas turns Python callables, parameters, lists, generated code, diagnostics, and local
  execution into a durable visual project.
- Realtime connects authored interfaces to ordinary Python handlers and presents live pipelines,
  streamed results, retained outputs, and artifacts.

Both applications expose strict machine-readable CLI boundaries as well as visual interfaces. That
combination is central to future apps: agents should be able to prepare, inspect, and hand off work
without reproducing human UI gestures, while the UI should make relationships, evidence, and
judgment easier for people to understand.

This document evaluates possible next applications. It is an ideas document, not an implementation
plan. The apps are focused open-source demonstrations of what `@setta/workspace` can do, not startup
theses. Each needs a clear purpose, a manageable implementation boundary, and useful relationships
with the other apps; it does not need a commercial moat.

Setta is not an AI agent harness. A person can use Codex, Claude Code, OpenCode, another agent, a
script, or another application outside Setta and exchange ordinary files through the same
documented CLI boundary. None of the recommended apps should own a model session, supervise an
agent loop, proxy tool calls, or require a particular provider SDK.

## Selection standard

A new standalone application should satisfy all of the following:

1. **Reuse dormant Setta strengths.** It should recover a small, coherent subset of capabilities
   from historical `main` or use Workspace capabilities that neither current application exercises.
2. **Have one clear purpose.** A person should be able to explain what the app helps them understand
   or decide without describing a general platform.
3. **Remain deliberately small.** A useful first version must not require a general agent runtime,
   workflow engine, distributed scheduler, secret vault, crawler, vector database, or collaboration
   platform.
4. **Work naturally with agents.** Agents and arbitrary applications should be able to create its
   inputs and consume its outputs through documented files and CLI contracts.
5. **Reserve human effort for judgment.** The app should automate collection and bookkeeping while
   making comparison, review, taste, or authority decisions pleasant and legible.
6. **Demonstrate a distinct interaction.** Removing Workspace's real content, relationships,
   attention, Inspector, managed windows, or saved presentations should materially weaken it.
7. **Complement the portfolio.** Its inputs or outputs should hand off naturally to another Setta
   app or arbitrary software, and it should not merely repeat another app's central interaction.

The practical ranking is:

`unused leverage + focused purpose + portability + portfolio synergy - implementation burden`

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
Python Canvas or Realtime as application features:

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

Historical code is evidence and a behavioral reference, not a drop-in application foundation. The
old agent, run, Git, file, and preview systems were integrated with a much broader application
model. Recovering a narrow capability can reduce discovery risk, but a new app still needs its own
small contract, persistence boundary, and failure semantics.

## Portfolio assessment

Each score is out of five. A higher **Simplicity** score means a smaller, easier-to-bound first
version.

| App direction                       | Leverage | Simplicity | Agentic value | Novelty | Decision               |
| ----------------------------------- | -------: | ---------: | ------------: | ------: | ---------------------- |
| Setta Review                        |        5 |          4 |             5 |       4 | Build                  |
| Experiment Lens                     |        5 |          4 |             5 |       3 | Build                  |
| Agent Context and Replay Bench      |        5 |          2 |             5 |       4 | Defer                  |
| Multi-format general evidence audit |        5 |          2 |             5 |       3 | Defer generalization   |
| Generic evaluation dashboard        |        4 |          2 |             4 |       1 | Do not build           |
| Generic visual runbook              |        4 |          1 |             2 |       1 | Do not build           |
| Broad investigation workspace       |        5 |          1 |             3 |       2 | Do not build           |
| Generic MCP inspector               |        3 |          4 |             4 |       1 | Do not build as an app |

Together with Python Canvas and Realtime, the recommended portfolio contains four focused apps.
Setta Review owns immutable requests and separate review responses. Experiment Lens owns linked
exploration state and portable selections over recorded experiment results. They share conventions
and artifacts without sharing an application model.

## Recommended application: Setta Review

Open the [Completion](setta-product-mockups.html#review-completion),
[Choice matrix](setta-product-mockups.html#review-choice),
[Choice artifact comparison](setta-product-mockups.html#review-choice-artifacts) review mockup.

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
- A **subject** is the claim, question, option, or candidate being considered.
- An **evidence reference** points to an exact Git hunk, text or log range, JSON result, local file,
  or content-addressed artifact.
- A **review response** records decisions, qualifications, rationale, selected artifacts,
  artifact-anchored annotations, unresolved items, and provenance without mutating the submitted
  request.
- An **artifact annotation** is an immutable overlay anchored to an exact artifact revision. A
  drawing can travel with the response without altering the submitted artifact.
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

Choice review has two presentations over that same request and response contract. A matrix keeps
structured options and tradeoff factors together. An artifact comparison uses managed windows when
the reviewer needs to judge images, text, JSON, or other admitted artifacts at useful fidelity. It
can record a selection, rejection, or qualification, include chosen artifacts, and attach
drawn feedback to an exact artifact revision.

### Why Workspace matters

- Real subjects, evidence, and options remain visible together instead of becoming abstract task
  labels.
- Typed edges show which evidence supports a claim or affects an option.
- Attention and framing bring every source for the selected subject into view.
- Managed windows make candidate, diff, log, artifact, and proposal comparison a first-class
  interaction.
- Saved views can provide Request, Evidence, Compare, and Response presentations over one record.
- Inspector controls can record a small decision without turning the app into a form builder.

Historical questions, approval cards, agent-run events, tool calls, Git views, previews,
attachments, artifacts, and AI Follow provide reference behavior. Current Workspace attention,
managed windows, Window Spaces, standalone surfaces, and typed controls provide the presentation
foundation.

### Bounded first version

1. Open one review request and an optional local Git worktree.
2. Support two built-in types: completion review and choice review. Choice review covers bounded
   questions, proposals, and candidate sets with type-specific presentations.
3. Resolve Git hunks, UTF-8 text or log ranges, JSON results, and local file artifacts, and attach
   drawing overlays to exact artifact revisions.
4. Export a versioned review response and optional continuation packet.

The first version does not run or resume an agent, edit source, execute tests, invoke tools, commit
or push Git changes, contact providers, authenticate remote services, or infer whether a claim is
true. Permission and policy changes can arrive as ordinary configuration diffs in completion
review; Review does not own a portable permission model or enforcement adapters.

## Recommended application: Experiment Lens

Open the [Experiment Lens mockup](setta-experiment-lens-mockup.html).

Experiment Lens should be a **read-only explorer for recorded experiment results produced by any
agent, script, notebook, or experiment system**. Its recurring question is:

> What happened across this result set, which exact observations and artifacts matter, and what
> should another person or tool inspect next?

The app does not generate arbitrary dashboards or execute project-supplied UI code. A trusted local
project supplies one typed manifest, an observation table, and local artifacts. Lens assembles a
bounded catalog of useful Setta sections from those semantics, while shared selection, filter, and
timeline state keeps the sections synchronized. The durable output is a portable selection packet
rather than another run database.

### Durable concepts

- An **experiment manifest** identifies the result set, factor and metric fields, stable observation
  IDs, timestamps when relevant, and content-addressed artifact references. It contains data
  semantics, not layout or executable UI definitions.
- The **built-in view catalog** contains facets, scatter and parallel-coordinate plots, a virtualized
  observation table, standardized time series, and admitted artifact viewers. Lens chooses the
  applicable sections from the manifest; projects do not provide React code, ECharts options, or a
  dashboard language.
- **Linked exploration state** contains the current filters, focused observation, explicit
  selection basket, and timeline or range position shared by participating sections.
- A **note** records human context against an exact observation, artifact revision, and optional
  time range. Spatial and drawn artifact feedback remains the responsibility of Review.
- A **selection packet** exports the selected observation IDs, filters, ranges, notes, and
  artifact references for another Setta app or arbitrary tool.

### Why Workspace matters

- Charts, a virtualized table, standardized series, and code, text, JSON, and image artifacts show
  the native outputs of an experiment instead of reducing everything to generic metrics.
- Shared selection and timeline state can coordinate a population view, exact observation, rich
  artifact, and event trace.
- Managed windows support temporary high-fidelity comparison without permanently expanding the
  main workspace.
- Attention, framing, and saved presentations can move between overview, failure replay, and pinned
  comparison without duplicating the underlying record.

The two mockup examples deliberately exercise different parts of the same bundled catalog. The
battery workspace links a dense sweep, table, aging trajectory, and thermal frame. The drone workspace
links a failure matrix, spatial replay, signal timeline, event trace, and controller source. The
first implementation proves the battery workflow; additional bundled section types can extend that
catalog without introducing project code or plug-in discovery.

### Bounded first version

1. Open one trusted local project with one admitted experiment manifest and content-addressed
   observation source.
2. Assemble applicable built-in facets, scatter, parallel-coordinate, table, series, and artifact
   sections from typed fields and local code, text, image, JSON, and standardized-series artifacts.
3. Provide shared selection, filtering, comparison, optional timeline state, and exact notes across
   those sections without rewriting the immutable inputs.
4. Export a versioned selection packet with selected row values, notes, ranges, and reverified
   artifact references.

The first version does not launch experiments, tune parameters, schedule work, replace an
experiment tracker, query an unbounded remote dataset, accept arbitrary chart specifications,
discover third-party sections, load project code, sandbox untrusted code, or define a general
plug-in system.

### Portfolio role

- Python Canvas or ordinary experiment code can produce manifests and artifacts for Lens.
- Lens can reduce a large result set to a precise selection packet for Setta Review.
- Review can record a decision or request follow-up without absorbing Lens's continuous exploration
  interaction.
- Realtime demonstrates live shared state that a future experiment presentation may use, but live
  ingestion is not required by the Lens first version.

## Deferred directions

### Agent Context and Replay Bench

Agent replay remains a strong long-term direction, but it is not a simple first application.
Freezing materialized context, normalizing different agent runtimes, replaying them safely, aligning
event streams, capturing artifacts, and explaining environmental differences together form an
execution platform.

A future agent Bench should consume Review responses and a proven portable run envelope. It should
not invent its review and execution contracts together inside its first release.

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
  repeat familiar interfaces and require broad evaluation infrastructure. Experiment Lens stays
  smaller by presenting one trusted project's recorded data and native artifacts through a bounded
  catalog of linked views.
- **Generic visual runbook:** scheduling, credentials, retries, recovery, idempotency, and audit
  dominate the implementation, and agents can plan many low-risk steps dynamically.
- **Broad investigation workspace:** ingestion, OCR, indexing, retrieval, entity resolution,
  collaboration, and publishing turn it into a large knowledge platform.
- **Generic MCP inspector:** discovery and invocation are useful features, but they do not create a
  durable record.
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
- exported responses, selection packets, and artifacts that remain useful without Setta installed;
  and
- deep links as optional conveniences rather than the only way to resolve content.

Shared framing and content-reference conventions are useful, but each app should retain its own
small canonical model. Cross-app handoff should happen through admitted, documented files and
artifacts rather than imports from another app's frontend or backend internals.

## Suggested order

1. Define the smallest open Review Request, evidence-reference, Review Response, and continuation
   envelopes.
2. Build completion review around a real agent or application handoff.
3. Add choice review with matrix and artifact-comparison presentations without introducing a
   generic review-type plug-in system.
4. Define the smallest Experiment Manifest and Selection Packet around one real result set.
5. Build Lens with bundled sections and shared selection state; enable the standardized timeline
   only when the admitted artifacts provide one.
6. Exercise the handoff by opening a Lens selection packet as Review evidence.
7. Reconsider Bench only after evidence, artifacts, selections, and review records already move
   cleanly between independent producers and consumers.

## App guardrail

Canvas nodes are a representation, not an app purpose. Agent execution is also a capability, not
automatically an app purpose. A new application should demonstrate one coherent use of Workspace,
give agents a documented file boundary, and produce something another app can consume. Its
interface should concentrate human attention on visual exploration, comparison, judgment, taste,
or authority that remains useful after the mechanical work is automated.

If an app requires Setta to select a model, maintain an agent conversation, route tool calls, or
resume provider-specific execution, it has crossed the boundary into an agent harness and should
be redesigned around file import and export instead.
