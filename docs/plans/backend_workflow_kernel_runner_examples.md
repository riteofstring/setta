# Backend Workflow Kernel Runner Examples

This reference supports [Backend Workflow Kernel Architecture Plan](backend_workflow_kernel_architecture_plan.md).

## Codex Agent Runner

User-facing node:

```text
Agent Task: Review implementation
```

Implementation:

- Starts a workflow-owned internal chat conversation.
- Streams assistant text and tool activity through existing chat production paths.
- Emits approval requests when Codex asks for permission.
- Extracts structured workflow result data from Setta-owned tool calls.
- Returns final status, signals, output, and file references to the workflow kernel.

UX benefit:

- The user sees a normal workflow node with expandable chat transcript and approvals.
- The workflow can route from `signals` or structured output instead of prose.

## Sandboxed Process Runner

User-facing node:

```text
Run Tests
```

Implementation:

- Runs a configured command in a configured working directory through an enforced sandbox boundary.
- Uses Anthropic Sandbox Runtime (`srt`) as the first sandbox provider to spike for macOS, Linux, and WSL2.
- Supports Docker or Podman as an optional stricter isolation provider when a container runtime is available.
- Treats unsandboxed local command execution as an explicit trusted mode that requires user approval and must not be presented as secure sandboxing.
- Streams stdout/stderr.
- Enforces timeout and output caps.
- Returns exit code and declared file references.

Minimum default policy:

- Network disabled.
- Read access limited to the workspace plus explicit allowlist.
- Write access limited to the workspace.
- Protected paths such as `.git`, `.codex`, app configuration, and credential locations are read-only or inaccessible.
- Environment starts empty or minimal, with explicit allowlist for required variables.
- Secrets are never inherited automatically.
- Timeout is required.
- Output cap is required.
- Approval is required for network access, writes outside the workspace, destructive commands, and unsandboxed fallback mode.

Example routing:

```text
exitCode == 0 -> Summarize Success
exitCode != 0 -> Ask Agent To Fix
```

UX benefit:

- Test output appears in the same node activity model as agent output.
- Failures are deterministic and routeable.
- The user gets a real enforcement boundary instead of relying on command naming conventions or prompt instructions.

## MCP Tool Runner

User-facing node:

```text
Create GitHub Issue
```

Implementation:

- Calls a configured MCP server/tool.
- Validates arguments.
- Requests approval before side-effecting operations when policy requires it.
- Returns structured result and external references.

UX benefit:

- External actions use the same approval UI as agent/tool approvals.
- Workflow history shows what external side effect was requested and approved.

## Python Structured Extraction Runner

User-facing node:

```text
Extract Invoice Data
```

Implementation:

- Starts a Python sidecar with a typed extraction implementation.
- Validates output against a schema.
- Returns structured JSON or a specific validation error.

UX benefit:

- Users get strict data extraction without seeing Python process details.
- Downstream routing can use typed fields like `invoice.total` or `requires_review`.

## Agent Subgraph Runner

User-facing node:

```text
Triage Customer Report
```

Possible implementation:

- LangGraph.
- OpenAI Agents SDK.
- LangFlow.
- Mastra.
- Pydantic AI.
- Custom TypeScript or Python sidecar.

Internal behavior might include:

```text
classify report
retrieve similar issues
ask specialist agent
check confidence
retry extraction
maybe request clarification
produce structured triage result
```

Setta still sees one node attempt with stream events and final output:

```json
{
  "severity": "high",
  "route": "human_review",
  "confidence": 0.78,
  "summary": "..."
}
```

UX benefit:

- The top-level graph remains understandable:

```text
Receive Report -> Triage Customer Report -> Route
```

- Advanced details can be shown inside the node activity panel instead of cluttering the main graph.
