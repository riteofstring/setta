# Setta Semantic Work Graph: High-Level Plan

## Purpose

Setta’s current graph is an executable workflow/runtime surface. Its nodes and edges define control flow: Agent Task, Route, Merge, Barrier Join, Start, End, and runtime state overlays.

The proposed addition is a separate **Semantic Work Graph**: a non-executable layer that shows what AI agents are working on, what concepts are involved, what questions or hypotheses emerged, and how users can steer future work.

Core principle:

> Workflow graph = what executes.  
> Runtime graph = what is happening now.  
> Semantic graph = what the work is about.  
> Activity overlay = what agents are focused on.  
> Steering directives = how users guide future work.

This keeps existing workflow semantics clean while adding a new surface for understanding and directing AI-assisted development.

---

## Product Goals

1. **Make AI work visible**  
   Users should see the concepts, questions, hypotheses, findings, decisions, and constraints involved in a coding session.

2. **Avoid muddying workflow semantics**  
   Semantic relationships and activity edges must not look or behave like control-flow edges.

3. **Populate automatically**  
   Users should not manually create semantic nodes. Nodes should emerge from prompts, agent trajectories, file activity, diffs, tool calls, and test results.

4. **Support review**  
   At the end of a session, the user should be able to inspect what was worked on and why.

5. **Enable steering**  
   Users should eventually steer agents by interacting with semantic nodes: focus here, avoid this, preserve this constraint, validate this hypothesis, or explain this area.

---

## Overall Architecture

Setta should maintain four related but distinct layers.

### 1. Workflow Graph

The saved executable workflow definition. Existing workflow nodes and control-flow edges remain unchanged.

### 2. Runtime Graph / Runtime Projection

The live execution state of a workflow or agent run: prompt nodes, agent task state, tool activity, logs, and runtime overlays.

### 3. Semantic Work Graph

A non-executable graph of structured public work state.

Examples:

- Concept: `friends list`
- Question: `should blocked users appear in mutual friends?`
- Hypothesis: `slow loading is caused by repeated profile lookups`
- Finding: `frontend requests profile details separately`
- Decision: `batch profile hydration in backend response`
- Constraint: `do not change public API response shape`

### 4. Activity Overlay

Animated or time-based edges from runtime/agent nodes to semantic nodes.

Example:

```text
Agent Task ──debugging──▶ Hypothesis: N+1 profile query
Agent Task ──editing──▶ Concept: friends backend API
Agent Task ──validating──▶ Concept: friends list performance
```

Activity edges mean agent attention/work association. They do not mean control flow.

---

## Semantic Cartographer

The task agent should focus on solving the user’s task. A separate **Semantic Cartographer** should observe the trajectory and maintain the Semantic Work Graph.

The cartographer analyzes:

- User prompt
- Agent messages
- File reads and edits
- Search queries
- Tool calls
- Terminal commands
- Test runs
- Diffs
- Existing semantic nodes
- User steering actions

The cartographer outputs graph updates:

- Create or reuse semantic nodes
- Link nodes to artifacts
- Create semantic relationships
- Mark agent activity
- Split overloaded nodes
- Merge duplicates
- Promote important nodes into durable memory

This keeps semantic graph maintenance decoupled from the task agent. The task agent may optionally emit hints, but the system should not depend on the agent reporting focus correctly.

---

## Lazy Semantic Graph Creation

Setta should not begin by scanning the whole repository and generating every possible concept. Large projects may contain many concepts, but a given AI session may only touch one or two.

Instead:

> The workspace index can exist eagerly, but semantic nodes should appear lazily from actual work.

A semantic node should appear when there is evidence it matters:

- The prompt mentions it
- The agent reads or edits related files
- The agent repeatedly searches for it
- Diffs or tests point to it
- The topic appears in prior session memory
- The user pins, edits, or steers toward it

This keeps the graph relevant and avoids speculative concept bloat.

---

## Semantic Nodes and Edges

Initial semantic node types should be small and understandable:

| Type | Meaning |
|---|---|
| Concept | A feature, subsystem, concern, or cross-cutting topic |
| Question | An unresolved issue or design question |
| Hypothesis | A possible explanation being investigated |
| Finding | Something discovered during the session |
| Decision | A conclusion or chosen direction |
| Constraint | A rule or boundary that should guide work |

Initial edge types should also be limited:

| Edge | Meaning |
|---|---|
| `about` | One node concerns another |
| `decomposes_to` | A concept expands into sub-concepts |
| `touches` | A concept relates to a file, folder, symbol, doc, prompt, or workflow node |
| `supports` | Evidence supports a hypothesis |
| `refutes` | Evidence weakens a hypothesis |
| `resolves` | A finding or decision resolves a question or hypothesis |
| `constrains` | A constraint applies to a concept |
| `related_to` | A weaker general association |

The graph should represent structured public work state, not raw hidden model reasoning.

---

## Prompt Nodes as the Bridge

Prompt nodes can connect runtime execution to semantic context.

Example prompt:

> Fix the friends list loading slowly without changing the API response shape.

Possible graph relationships:

```text
Prompt ──starts──▶ Agent Task
Prompt ──asks_about──▶ Concept: friends list
Prompt ──asks_about──▶ Concept: performance
Prompt ──creates_constraint──▶ Constraint: do not change public API response shape
```

The semantic graph can then provide context back to the agent:

- Relevant concepts
- Prior decisions
- Open questions
- Constraints
- Related files and symbols
- User steering directives

This creates a useful loop:

```text
Prompt activates semantic context
→ semantic context informs the agent
→ agent trajectory updates the semantic graph
→ user edits the graph
→ future agents use the improved graph
```

---

## Node Expansion and Splitting

Semantic nodes should support expansion into local subgraphs.

Double-clicking a node could ask the cartographer for a decomposition without immediately committing every subnode to durable state.

Example:

```text
friends list
├── friends list UI
├── friends backend API
├── friend privacy rules
└── friends list performance
```

The cartographer should also be able to split overloaded nodes. Splitting should usually be hierarchical rather than destructive: keep the original node as an umbrella concept and add child nodes below it.

---

## Persistence and Lifecycle

Semantic nodes should persist enough to support session review, but not every transient idea should become permanent project memory.

Recommended lifecycle:

1. **Candidate**  
   Detected by the cartographer but not yet visible.

2. **Visible Session Node**  
   Shown because it matters to the current session. Persisted in session history.

3. **Workspace Semantic Node**  
   Promoted into durable project memory because the user pinned it, edited it, reused it across sessions, or it became tied to a decision/constraint.

Default rule:

> Visible nodes persist in the session record.  
> Pinned or promoted nodes persist into workspace memory.

---

## UX Model

The semantic layer should feel like an editable map of AI work.

Core interactions:

- **Inspect**: click a node to see summary, evidence, related files, active agents, and history.
- **Expand**: double-click to reveal a local semantic subgraph.
- **Pin**: keep an important node visible and available as future context.
- **Rename**: correct or clarify a node label.
- **Merge**: combine duplicates or overlapping concepts.
- **Split**: break a broad concept into more precise subtopics.
- **Dismiss**: hide an irrelevant or low-value node.
- **Add constraint**: attach a user instruction to a concept.
- **Focus agent here**: create an explicit steering directive.

Graph interactions should create explicit steering directives rather than implicitly changing agent behavior.

Examples:

- Focus on this concept
- Avoid this direction
- Validate this hypothesis
- Preserve this constraint
- Explain this node
- Treat this as high priority

---

## Visual Treatment

The semantic graph should be visually distinct from the workflow graph.

Suggested treatment:

- Workflow nodes: crisp, executable, control-flow oriented
- Semantic nodes: softer, conceptual, non-executable
- Activity edges: animated and visually distinct from workflow edges
- Semantic edges: static relationship lines
- Prompt nodes: bridge between user intent and runtime execution
- Pinned nodes: persistent visual emphasis
- Low-confidence nodes: subdued or hidden by default
- Constraints and decisions: badges or attached cards

The canvas should support layer toggles:

```text
Workflow | Runtime | Semantic | Activity | Artifacts | History
```

Default view should emphasize active and nearby semantic nodes, not the entire graph.

---

## MVP Scope

The first version should validate the product value without overbuilding.

Include:

- Lazy semantic node creation from agent trajectories
- Semantic Cartographer as a separate observer
- Concepts, questions, hypotheses, findings, decisions, and constraints
- Activity edges from agents/runtime nodes to semantic nodes
- Session persistence for visible semantic nodes
- Promotion/pinning into workspace memory
- Inspect, expand, pin, rename, merge, split, dismiss
- Add constraint and focus-agent-here interactions

Defer:

- Full repository-wide concept generation
- Large ontology of node and edge types
- Required focus-reporting tools inside task agents
- Full multi-agent blackboard workflows
- Automatic permanent promotion of every generated node
- Displaying all semantic edges by default

---

## Longer-Term Direction

The Semantic Work Graph can eventually become a shared blackboard for multi-agent collaboration.

Agents could contribute and consume structured public work state:

- Questions
- Hypotheses
- Findings
- Decisions
- Constraints
- Risks
- Validation results
- Open issues

Long-term vision:

> Setta becomes a workspace where users, agents, code, prompts, workflows, and semantic project knowledge are connected in one inspectable graph.

---

## 10-Minute Meeting Takeaway

Recommended direction: build a **Lazy Semantic Work Graph** maintained by a separate **Semantic Cartographer**.

Key decisions:

1. Keep workflow control flow separate from semantic relationships.
2. Do not pre-generate a full project concept map.
3. Let semantic nodes emerge from actual agent work.
4. Use a cartographer LLM to interpret trajectories and maintain the graph.
5. Represent structured public work state, not raw hidden model reasoning.
6. Use prompt nodes as the bridge between user intent, runtime execution, and semantic context.
7. Let users inspect, expand, pin, rename, merge, split, dismiss, and steer through semantic nodes.
8. Persist session graphs for review, while promoting only selected nodes into workspace memory.
9. Start minimal, then grow toward multi-agent blackboard collaboration.
