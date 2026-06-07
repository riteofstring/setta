# Setta Semantic Work Graph Plan

## Purpose

Setta’s existing visual graph should remain the place where users define and inspect executable workflows. The new semantic layer should not change workflow edge semantics or turn concepts into control-flow nodes. Instead, Setta should add a **Semantic Work Graph**: a persistent, public work-memory layer that represents what agent work is about, what has been discovered, what constraints apply, and how agents are coordinating.

The goal is not to expose raw LLM chain-of-thought. The goal is to show structured, inspectable, user-editable work state inferred from prompts, agent trajectories, file activity, diffs, tests, and user steering.

Core framing:

```text
Workflow Graph      = what can execute.
Runtime Projection  = what happened or is happening in a specific run.
Semantic Work Graph = what the work is about and what is known.
Activity Overlay    = which agents are working on which semantic areas.
```

---

## High-Level Architecture

### 1. Workflow Graph

The workflow graph is the saved executable definition. It owns control-flow semantics.

It may contain nodes such as:

- Start
- End
- Prompt/Input
- Agent Task
- Route
- Merge
- Barrier Join

Prompt nodes should generally belong here when they are part of a saved executable workflow. A prompt node defines how user intent enters the workflow.

### 2. Runtime Projection

The runtime projection is the per-run instance of the workflow graph after execution starts.

It shows:

- which workflow nodes are active, complete, failed, or skipped
- concrete prompt input for the run
- active agent tasks
- tool calls
- logs
- generated diffs
- test runs
- runtime errors

A workflow prompt node may have a runtime instance containing the actual user prompt text for that run.

### 3. Semantic Work Graph

The Semantic Work Graph is a persistent public work-memory layer. It contains concepts and structured work artifacts inferred from actual agent activity and user input.

Initial semantic node kinds:

- Concept
- Question
- Hypothesis
- Finding
- Decision
- Constraint

Examples:

```text
Concept:    friends list
Question:   Should blocked users appear in mutual friends?
Hypothesis: Slow loading is caused by repeated profile lookups.
Finding:    FriendService loads profiles one at a time.
Decision:   Batch profile hydration without changing the response shape.
Constraint: Do not change the public API response shape.
```

Semantic nodes should be grounded in evidence whenever possible: prompts, files, symbols, diffs, tests, docs, chats, workflow nodes, or agent activity.

### 4. Activity Overlay

Activity edges are not workflow edges. They are runtime or historical overlays connecting agent/runtime activity to semantic nodes.

Example:

```text
Backend Agent ──debugging──▶ Hypothesis: repeated profile lookups
Frontend Agent ──editing──▶ Concept: friends list UI
Validation Agent ──validating──▶ Constraint: preserve API response shape
```

During a run, activity edges can be animated. After a run, they become historical activity intervals that support session review and optional replay.

### 5. Semantic Cartographer

The Semantic Cartographer is a separate LLM-backed system that observes agent trajectories and updates the Semantic Work Graph.

Task agents should focus on doing the work. They should not be responsible for manually maintaining semantic nodes or reporting perfect focus events.

The cartographer observes:

- user prompts
- agent messages
- tool calls
- file reads
- file edits
- diffs
- search queries
- test runs
- compiler/runtime errors
- workflow metadata
- existing semantic nodes
- user steering actions

It emits structured semantic graph patches:

- create or reuse node
- update node
- create semantic edge
- attach evidence or artifact anchors
- split node
- merge nodes
- set activity interval
- mark finding/decision/constraint
- archive or promote node

### 6. Context Pack Builder

Semantic nodes should be able to influence agent context, but not by dumping the entire semantic graph into every prompt.

A Context Pack Builder selects the relevant semantic neighborhood for a run or agent task. It combines:

- current prompt text
- workflow configuration
- relevant semantic nodes
- applicable constraints
- prior decisions
- unresolved questions
- user steering directives
- relevant artifact anchors

This makes semantic memory useful while keeping context selection explicit and inspectable.

### 7. Constraint Enforcement Layer

Constraint nodes live in the Semantic Work Graph, but enforcement belongs to workflow/runtime mechanisms.

A constraint can be:

- soft: included as prompt/context guidance
- judged: checked by an LLM-as-a-judge or review step
- validated: checked by tests, schema diffs, type checks, or custom tools
- gated: enforced by workflow approval or blocking conditions

Example:

```text
Semantic constraint:
Do not change the public API response shape.

Possible enforcement:
- OpenAPI diff check
- generated client compatibility check
- regression tests
- LLM judge over old/new response examples
- human approval gate
```

This separation keeps semantic meaning and executable enforcement cleanly separated.

---

## Lazy Semantic Graph Generation

Setta should not eagerly scan a large project and create every possible concept before work begins.

Instead:

```text
Indexes may exist eagerly.
Semantic nodes appear lazily from actual work.
```

Setta can maintain background indexes over files, symbols, docs, embeddings, dependencies, git history, and tests. But semantic nodes should be created when there is evidence that they matter in the current or recent work session.

Creation signals include:

- the user prompt mentions a topic
- agents read or edit related files
- tool calls cluster around an area
- diffs indicate a semantic concern
- tests or errors reveal a topic
- the cartographer detects a repeated theme
- the user pins, steers, or edits a node

This avoids graph bloat and keeps the graph grounded in actual work.

---

## Prompt Nodes as the Bridge

Prompt nodes act as a bridge because they connect execution, user intent, and semantic context selection.

A prompt node belongs to the workflow when it is part of the saved executable graph. At runtime, the prompt instance contains the actual user request. The cartographer can use that runtime prompt to seed or activate relevant semantic nodes.

Example:

```text
Prompt:
Fix friends list performance without changing the API response shape.

Semantic interpretation:
- Concept: friends list
- Concept: performance
- Constraint: do not change public API response shape

Context pack:
- relevant prior decisions
- related files
- applicable constraints
- unresolved questions
- user steering directives
```

Semantic nodes can affect agent context through explicit user steering or conservative automatic retrieval. The prompt node provides the run-specific activation boundary: it helps decide which semantic subgraph is relevant to this execution.

Recommended initial policy:

```text
Always include explicit user steering.
Conservatively include high-confidence relevant semantic context.
Show users what semantic context is being used.
Allow users to remove or adjust it.
```

---

## Semantic Edges

Semantic edges should have meanings distinct from workflow edges.

Initial edge kinds:

- about
- decomposes_to
- touches
- supports
- refutes
- resolves
- constrains
- conflicts_with
- related_to

Examples:

```text
Hypothesis: repeated profile lookups
  ──about──▶ Concept: friends list performance

Finding: FriendService loads profiles one at a time
  ──supports──▶ Hypothesis: repeated profile lookups

Decision: batch profile hydration
  ──resolves──▶ Hypothesis: repeated profile lookups

Constraint: do not change response shape
  ──constrains──▶ Concept: friends backend API

Concept: friends list UI
  ──touches──▶ File: FriendsList.tsx
```

The UI should avoid showing every edge at once. Users should be able to filter or expand semantic relationships as needed.

---

## Expansion, Decomposition, and Splitting

Setta should distinguish three related operations.

### Expand

Expand is a temporary UX action.

```text
User double-clicks "friends list"
→ Setta shows a generated subgraph preview.
```

This does not necessarily mutate durable graph state.

### Decompose

Decompose adds child concepts while preserving the parent as a valid umbrella concept.

```text
friends list
  ├── friends list UI
  ├── friends backend API
  └── friend privacy rules
```

### Split

Split is an actual graph mutation. It replaces an overloaded or inaccurate node with more precise nodes.

```text
Before:
friends list

After:
friends list UI
friends backend API
friend privacy rules
```

A split should preserve lineage and reassign evidence, anchors, edges, activity history, and steering directives where appropriate.

Users should be able to review or approve important splits. The old node should remain traceable as a superseded node so history is not lost.

---

## UX Model

The graph UI should allow users to understand and steer AI work without confusing semantic relationships with workflow execution.

Core UX behaviors:

- Semantic nodes appear near relevant workflow/runtime activity.
- Animated activity edges show what agents are working on.
- Clicking a node shows why it exists, what evidence supports it, which agents touched it, and what files or decisions are related.
- Double-clicking a node expands it into a local semantic subgraph preview.
- Users can pin, rename, merge, split, dismiss, or promote nodes.
- Users can attach constraints or steering directives to semantic nodes.
- At the end of a session, visible semantic nodes persist as a reviewable map of the work.
- Promoted nodes become durable workspace memory for future context.

Visual separation should be clear:

```text
Workflow nodes: executable, crisp, control-flow edges.
Semantic nodes: softer, evidence-backed, non-executable.
Activity edges: animated runtime/historical overlays.
Constraint/decision badges: visible but not confused with control flow.
```

---

## User Steering

User interactions with semantic nodes should produce explicit steering directives, not implicit layout hints.

Examples:

```text
Pin this concept.
Focus the agent here.
Avoid this hypothesis.
Validate this before editing.
Do not change this API.
Explain this node.
Split this overloaded concept.
Merge these duplicates.
```

Steering directives can have scope:

- current run
- session
- workspace

They can also have strength:

- hint
- preference
- requirement

Agents should receive steering through context packs or workflow/runtime controls, not by interpreting the visual graph layout directly.

---

## Multi-Agent Blackboard Collaboration

The Semantic Work Graph should be designed early as a future multi-agent blackboard.

In multi-agent work, each agent has its own trajectory. Without a shared semantic layer, coordination depends on long transcripts, summaries, or a central coordinator. A semantic blackboard gives agents and users a shared public state:

- open questions
- hypotheses
- findings
- decisions
- constraints
- risks
- active concepts
- blockers
- ownership/activity

Example:

```text
Backend Agent:
Finding: FriendService performs profile lookup per friend.

Frontend Agent:
Finding: FriendsList renders all rows eagerly.

Validation Agent:
Question: Do we have regression coverage for blocked users?

Cartographer connects all three to:
Concept: friends list performance
```

The blackboard helps agents coordinate without needing to read every other agent’s full transcript.

### How It Works

1. Agents work independently or in parallel.
2. The cartographer observes each trajectory.
3. It writes shared semantic nodes and edges.
4. Agents receive relevant semantic context packs.
5. Users inspect, steer, resolve conflicts, or assign focus.

Example context pack for a backend agent:

```text
Relevant concept:
- friends backend API

Applicable constraint:
- do not change public API response shape

Related finding:
- frontend depends on current response shape

Open question:
- should blocked users appear in mutual friends?
```

Example context pack for a validation agent:

```text
Relevant concepts:
- friends list performance
- friend privacy rules

Decisions to validate:
- batch profile hydration behind existing response shape

Checks to run:
- backend social tests
- API compatibility check
- blocked-user regression tests
```

### Why It Matters

The semantic graph can show:

- which agent owns or is active on which topic
- whether two agents are duplicating work
- whether findings support or refute hypotheses
- whether decisions conflict with constraints
- which questions remain unresolved
- what should be validated before completion

This makes the semantic graph more than visualization. It becomes shared coordination infrastructure.

---

## Session Review and Optional Replay

Visible session nodes should persist after the run so users can inspect what was worked on.

At minimum, Setta should support session review:

- concepts touched
- hypotheses considered
- findings discovered
- decisions made
- constraints applied
- files changed
- agents involved
- validation performed

Session replay can be optional in the UX, but the architecture should preserve replay-compatible event history.

Replay could show the semantic graph evolving over time:

```text
Prompt appears.
Agent starts.
Concept nodes appear.
Activity shifts between nodes.
Hypothesis is created.
Finding supports hypothesis.
Constraint is applied.
Decision resolves hypothesis.
Validation passes.
Run completes.
```

This is useful for trust, debugging, auditability, and understanding multi-agent work.

---

## Recommended MVP

The MVP should validate the core idea without overbuilding.

### Include

- Lazy semantic node creation from actual agent trajectories
- Semantic Cartographer as a separate observer
- Concept, Question, Hypothesis, Finding, Decision, and Constraint nodes
- Activity edges from runtime agent activity to semantic nodes
- Evidence/provenance for nodes and edges
- Click to inspect
- Double-click to expand local subgraph preview
- Pin, rename, merge, split, dismiss
- Basic steering directives
- Session review
- Conservative semantic context packs

### Defer or Keep Minimal

- Full automatic project-wide concept initialization
- Complex ontology of many node and edge types
- Full replay UI
- Advanced multi-agent scheduling
- Fully automated constraint enforcement for every constraint type

### Design for Later

Even if V1 is single-agent, the architecture should preserve:

- event history
- graph patch provenance
- activity intervals
- semantic node ownership/activity
- explicit steering directives
- constraint nodes linked to validation mechanisms
- context packs that can be built per agent

This keeps the system compatible with future multi-agent blackboard collaboration.

---

## Final Product Principle

Setta should not visualize hidden model thoughts. It should visualize structured public work state.

The Semantic Work Graph should become a persistent, user-editable memory of what agents worked on, what they found, what decisions were made, what constraints matter, and how future agents should be steered.

The key separation is:

```text
Task agents do the work.
The Semantic Cartographer explains the work as a graph.
The user edits the graph to steer future work.
The workflow/runtime system executes and enforces behavior.
```
