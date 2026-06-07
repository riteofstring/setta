# Setta Semantic Work Graph Plan

## Purpose

Setta’s existing graph should remain the place where users define and inspect executable workflows. The new layer should be a **Semantic Work Graph**: a persistent, public work-memory layer that represents what agent work is about, what has been discovered, what constraints apply, and how agents can coordinate.

The goal is not to expose raw LLM chain-of-thought. The goal is to show structured, inspectable, user-editable work state inferred from prompts, agent trajectories, file activity, diffs, tests, and user steering.

Core framing:

```text
Workflow Graph            = saved executable structure
Runtime Projection        = per-run execution state
Semantic Work Graph       = public memory of what the work is about
Activity Overlay          = current/historical links from agent activity to semantic nodes
Semantic Context Compiler = selected semantic context given to agents
```

---

## Architecture

### Workflow Graph

The workflow graph is the saved executable definition. It owns control-flow semantics and may contain Start, End, Prompt/Input, Agent Task, Route, Merge, Barrier Join, and Validation Gate nodes.

A prompt node belongs to the workflow graph when it is part of a saved executable workflow. It defines how user intent enters the workflow.

### Runtime Projection

The runtime projection is the per-run instance of the workflow after execution starts. It shows which workflow nodes are active, complete, failed, or skipped, plus concrete runtime data: actual prompt input, active agent tasks, tool calls, logs, diffs, tests, and errors.

### Semantic Work Graph

The Semantic Work Graph is persistent public work memory. Initial semantic node kinds should be:

```text
Concept, Question, Hypothesis, Finding, Decision, Constraint
```

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

### Activity Overlay

Activity edges are not workflow edges. They connect runtime activity to semantic nodes.

```text
Backend Agent    ──debugging──▶ Hypothesis: repeated profile lookups
Frontend Agent   ──editing────▶ Concept: friends list UI
Validation Agent ──validating─▶ Constraint: preserve API response shape
```

During a run, activity edges can be animated. After a run, they become historical activity intervals for session review and optional replay.

### Semantic Cartographer

The Semantic Cartographer is a separate LLM-backed system that observes agent trajectories and updates the Semantic Work Graph. Task agents should focus on doing the work, not on manually maintaining semantic nodes.

The cartographer observes prompts, agent messages, tool calls, file reads/edits, diffs, searches, tests, errors, workflow metadata, existing semantic nodes, and user steering. It emits graph patches such as creating/reusing nodes, attaching evidence, creating edges, setting activity intervals, splitting/merging nodes, and marking findings, decisions, questions, or constraints.

---

## Prompt Nodes and Runtime Prompts

A saved workflow might look like this:

```text
Start → Prompt Node: Code Change Request → Agent Task → Validation Gate → End
```

The saved prompt node could contain a reusable template:

```text
User request:
{{ user_request }}

Relevant semantic context:
{{ semantic_context }}

Active constraints:
{{ constraints }}
```

At runtime, the user provides a concrete request:

```text
Fix the friends list loading slowly, but do not change the API response shape.
```

Setta fills the runtime prompt instance with the user request plus selected semantic context:

```text
Relevant semantic context:
- [sem_12] friends list
- [sem_18] friends backend API
- [sem_21] query performance
- [sem_44] prior decision: privacy filtering happens in the backend

Active constraints:
- [sem_31] Do not change public API response shape.
```

The distinction is:

```text
Workflow prompt node = saved template/configuration
Runtime prompt       = filled-in prompt for this run
Semantic graph       = persistent memory used to help fill the prompt
```

For an ad hoc chat request, Setta can create an ephemeral runtime prompt node even if the user did not explicitly design a saved workflow.

---

## Semantic Context Compiler

The **Semantic Context Compiler** turns selected semantic graph state into the bounded context that an agent receives. This is useful because Setta should not dump the entire semantic graph into every prompt; much of it may be stale, unrelated, speculative, or low confidence.

A Semantic Context Pack may contain:

```text
Relevant concepts
Active constraints
Prior decisions
Open questions
User steering directives
Relevant files, symbols, docs, or diffs
Reason each item was included
Priority: background, relevant, important, or required
```

Example agent-facing context:

```text
Relevant concept:
[sem_12] friends list
Reason: user prompt mentions friends list; prior activity touched FriendsList.tsx and FriendService.ListFriends.
Artifacts: frontend/src/components/FriendsList.tsx, backend/social/friends.go

Required constraint:
[sem_31] Do not change public API response shape.
Instruction: Preserve the existing response schema. If a schema change seems necessary, stop and ask for approval.

Prior decision:
[sem_44] Privacy filtering happens in the backend.
Implication: Do not move blocked-user filtering into frontend-only logic.
```

Agents should receive semantic context at explicit moments:

```text
Run start
Agent Task start
User steering during an active run
Phase boundaries, such as before editing or validation
When an agent explicitly asks for semantic context
```

Mid-run steering should be delivered as a clear context update, not as an invisible mutation of prompt state.

---

## Lazy Semantic Graph Generation

Setta should not eagerly scan a large project and create every possible concept before work begins.

```text
Indexes may exist eagerly.
Semantic nodes appear lazily from actual work.
```

Background indexes over files, symbols, docs, embeddings, dependencies, git history, and tests can support retrieval. But semantic nodes should appear only when there is evidence that they matter: the prompt mentions a topic, agents read/edit related files, diffs or tests reveal a concern, the cartographer detects a repeated theme, or the user steers toward a node.

---

## Semantic Node Operations

The graph should support these operations:

```text
Expand    = temporary UX preview of a local subgraph
Decompose = create child subtopics while keeping the parent as an umbrella node
Split     = actually replace/refine an overloaded or incorrect node
Merge     = combine duplicates
Rename    = change canonical label while preserving aliases/history
Dismiss   = hide irrelevant nodes
Promote   = make a session node durable workspace memory
```

Actual splitting should be first-class. If `friends list` is overloaded, it may be split into `friends list UI`, `friends backend API`, and `friend privacy rules`. The original node should retain lineage so users can see what happened, and its edges, anchors, activity history, and steering directives should be reassigned.

Semantic node layout should be separate from semantic meaning. Nodes may appear near relevant workflow/runtime activity by default, but all visible nodes should be movable by the user. User-moved nodes should not be auto-repositioned unless the user requests re-layout.

---

## Steering Mechanics

Semantic steering should be explicit. A graph interaction should create a concrete directive, context update, or constraint.

```text
User graph action
  ↓
Steering directive or constraint node
  ↓
Semantic Context Compiler includes it in a context pack or delta
  ↓
Agent receives explicit instruction
  ↓
Cartographer observes the result
  ↓
Semantic graph and activity history update
```

Important distinctions:

```text
Visual pin        = keep node visible or fixed on canvas
Session pin       = keep node relevant for the current session
Workspace pin     = promote node into durable semantic memory
Attach to run     = include this node in the current run's agent context
Focus agent here  = ask an active agent to prioritize this semantic node
Avoid             = tell agent not to pursue this area unless necessary
Validate          = ask agent/workflow to check a hypothesis, decision, or constraint
```

Example: the user attaches `blocked user privacy` to the current run. The agent receives:

```text
User steering update:
Include [sem_67] blocked user privacy in the current task.

Reason:
The user explicitly attached this semantic node to the run.

Relevant artifacts:
- backend/social/privacy.go
- backend/social/friends.go

Instruction:
Consider blocked-user visibility when changing friends list behavior.
```

This makes steering inspectable, auditable, and reversible.

---

## Constraints and Enforcement

Constraint nodes live in the Semantic Work Graph because they express what should be true and what they apply to. Enforcement should happen through workflow/runtime mechanisms.

```text
Semantic node:
Constraint: Do not change public API response shape.

Semantic edge:
Constraint ──constrains──▶ Concept: friends backend API

Workflow/runtime enforcement:
Constraint ──enforced_by──▶ Validation Gate: OpenAPI Diff Check
```

Enforcement levels:

```text
prompt_only       = included in agent context as an instruction
llm_judge_checked = LLM judge reviews output or diff against the constraint
code_checked      = tests, schema diffs, type checks, file guards, or custom tools check it
workflow_gate     = workflow cannot proceed or complete unless the check passes
```

Examples:

```text
Do not touch billing code        → file edit guard
Do not change API response shape → schema diff, contract tests, or LLM judge
Keep implementation simple       → prompt-level guidance, LLM review, or human review
Preserve privacy behavior        → tests plus judge/human review
```

This keeps semantic meaning and executable enforcement cleanly separated while allowing them to link together.

---

## Multi-Agent Blackboard Collaboration

The Semantic Work Graph should be designed early as a shared blackboard for multi-agent work, even if the first version is single-agent.

Direct agent-to-agent chat is useful, but it does not scale well as the primary coordination mechanism. Group chat creates context bloat, stale claims, weak grounding, poor concurrency, noisy UX, unclear ownership, difficult replay, and poor selective retrieval for future agents.

The better distinction is:

```text
Agent chat       = short-lived communication
Semantic graph   = durable shared memory
Activity overlay = who is working where
```

Example multi-agent flow:

```text
User request:
Fix friends list performance without changing the API response.

Workflow starts:
- Coordinator Agent
- Backend Agent
- Frontend Agent
- Validation Agent

Initial semantic context:
- Concept: friends list
- Concept: query performance
- Constraint: do not change API response shape
- Prior decision: privacy filtering happens in backend

Assignments:
- Backend Agent → friends backend API
- Frontend Agent → friends list UI
- Validation Agent → regression coverage

Cartographer updates blackboard:
- Hypothesis: repeated profile lookups cause slowness
- Finding: FriendService loads profiles one at a time
- Finding: FriendsList renders all rows eagerly
- Question: should pagination be server-side?
- Decision: batch profile hydration without changing response schema
```

Agents then receive compact, role-specific context deltas instead of reading every other agent’s transcript. Direct chat can still exist, but the cartographer should extract durable findings, questions, decisions, constraints, and conflicts into the semantic graph.

---

## UX Model

Useful UX principles:

```text
Workflow nodes look executable and crisp.
Semantic nodes look softer and non-executable.
Activity edges are visually distinct from workflow edges.
Clicking a node shows why it exists and what evidence supports it.
Double-clicking expands a local semantic subgraph preview.
Users can move, pin, rename, split, merge, dismiss, attach, focus, avoid, validate, or add constraints.
```

Session replay should be optional in the UX but supported by the architecture. If semantic graph updates and activity intervals are timestamped, Setta can later replay how a session unfolded:

```text
Prompt appears → semantic nodes appear → agents work → hypotheses/findings/decisions emerge → constraints are checked → final result lands.
```

Replay would support post-session review, debugging agent behavior, auditability, and multi-agent coordination review.

---

## MVP Recommendation

Build the smallest version that validates the core loop:

```text
Agent works.
Cartographer interprets trajectory.
Semantic nodes appear.
Activity edges show what is being worked on.
User can inspect and steer.
Selected semantic context reaches agents explicitly.
Session history persists.
```

MVP scope:

```text
Node kinds: Concept, Question, Hypothesis, Finding, Decision, Constraint
Edges: about, touches, supports, refutes, resolves, constrains, related_to
Activity: exploring, editing, debugging, validating, blocked
Generation: lazy, from actual work
Steering: attach to run, focus agent here, avoid, validate, add constraint
Context: run start, Agent Task start, and mid-run steering deltas
Constraints: prompt-only plus one or two simple enforcement integrations
UX: movable nodes, inspect, expand, split, merge, rename, dismiss, pin
Persistence: session history compatible with future replay
```

Longer-term extensions include richer enforcement, role-specific multi-agent packs, blackboard conflict detection, semantic subscriptions for agents, replay UI, and conservative workspace-wide semantic memory retrieval.

---

## Core Product Bet

Setta should not merely show that an agent is running. It should show what the work is about, what has been learned, what constraints matter, and how users can steer the process.

The central design principle is:

```text
Task agents do the work.
The Semantic Cartographer explains the work as public graph state.
The Semantic Context Compiler feeds selected graph state back to agents.
Users edit the graph to steer future work.
```
