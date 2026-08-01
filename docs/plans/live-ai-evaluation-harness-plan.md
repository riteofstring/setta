# Live AI Evaluation Harness Plan

**Date:** 2026-07-31
**Status:** Proposed.

## Outcome

Once Phase 0 proves the credential-safe boundary, one on-demand command runs
five live, Director-only scenarios against the real Setta orchestration stack
in disposable Docker isolation and produces a small report answering four
separate questions:

1. Did Setta complete the task?
2. How many system tokens did a successful task consume?
3. Did Setta communicate truthfully and at the right level?
4. Could the user control the work entirely through the Director?

The first command is:

```sh
./scripts/run_setta_evals.sh
```

This is an evaluation runner, not a second test framework. It has one fixture,
five scenarios, deterministic end-state verifiers, one fixed communication
judge, JSON artifacts, and a Markdown summary. There is no dashboard, database,
synthetic user agent, benchmark adapter, or automatic prompt optimizer.

Live evaluations and deterministic product tests remain different things. The
existing Electron and fake-provider workflows prove that Setta's application
paths work predictably. This harness measures the quality, reliability, and
cost of real models. Neither result substitutes for the other.

The harness is unreleased and has exactly one current design. There is no
legacy eval behavior to preserve. Every phase changes the current contracts and
implementation directly, regenerates any affected generated surfaces, updates
all checked-in scenarios and fixtures in the same change, and deletes whatever
it supersedes.

## What is true today

The implementation starts with substantial existing machinery.

- `internal/runtime/live_codex_workflow_test.go` already starts the real backend,
  opens disposable workspaces, sends work through the Director, and runs against
  the locally ChatGPT-authenticated Codex CLI without `OPENAI_API_KEY`.
- `desktop/tests/electron/electron-workflow-harness.mjs` already owns temporary
  app data, disposable workspace fixtures, backend discovery, recordings, and
  production-path Electron driving.
- `/director/intents/dispatch`, `/director/events`, and
  `/conversations/events` are registered production HTTP boundaries in
  `internal/httpapi/endpoints.go`. The two event streams are push-based and are
  sufficient for event-triggered scripts; the eval runner does not need a new
  polling surface.
- Role configuration is already a production contract. A run can select exact
  models and reasoning effort through the existing global or workspace role
  configuration service instead of adding eval-only model overrides.
- The current release defaults in
  `internal/conversation/role_profile_defaults.go` are Director
  `gpt-5.6-terra`/medium, Agent `gpt-5.6-sol`/high, and Narrator
  `gpt-5.4-mini`/low. Those defaults are the initial baseline, not constants to
  mirror in the eval runner. The implementation calls the task-performing role
  `Agent`; this plan uses that repository term for the Worker in the product
  description.
- Durable conversation events already expose running, queued, steering,
  completed, cancelled, failed, trajectory, file-change, and narration facts.
  The runner can trigger follow-up messages from those typed facts rather than
  parsing prose or sleeping for an arbitrary duration.
- Codex already emits `thread/tokenUsage/updated`, including input, cached input,
  output, reasoning output, and total tokens. The checked-in provider matrix
  correctly classifies it as evidence, but `internal/agent/provider_events.go`
  currently does not give that evidence an accounting owner. Token accounting
  therefore needs an ephemeral observer; it must not be added to durable
  conversation state.
- The session recorder already records resolved invocations, narration
  invocations, and semantic trajectory, but not the exact token evidence or a
  purpose-built user-visible transcript.
- There is no checked-in Docker eval environment today. On the target MacBook,
  Docker Desktop and an ARM64 Docker client are installed. The machine has 8
  CPU cores, 32 GiB of memory, and ample free disk. Docker Desktop must be
  running before an eval; the runner should detect that condition and never
  start it automatically.

One sandbox fact is unresolved and must be resolved first. The production
runtime launches `codex app-server` as a child process, and live runs use the
host's ChatGPT authentication. Mounting the host Codex home or auth file into a
container would put a real credential in the same environment as AI-controlled
commands. A read-only mount does not solve disclosure. The implementation must
prove a supported credential-safe boundary before claiming Docker isolation.

## Decisions

### The runner is Go-owned and headless

Add a development command under `cmd/setta-eval` with implementation under
`internal/evalharness`, invoked through the pinned Go toolchain by
`scripts/run_setta_evals.sh`.

Go owns the runtime, role configuration, event contracts, and invocation
records. Keeping the scenario schema and runner there avoids a TypeScript mirror
and lets the harness consume the production contracts directly. JSON is used
for scenario files so the MVP needs no YAML dependency.

The live runner starts the production backend with disposable app data and
drives its authenticated HTTP boundary. It does not call conversation services
directly. It therefore covers the Director, Narrator, Agent, provider, tools,
HTTP, durable store, queueing, steering, cancellation, and restartable state,
without paying the cost or brittleness of pixel-driving Electron for every live
model comparison.

The existing deterministic Electron workflow remains the owner of
main/preload/renderer wiring. If implementation changes one of those contracts,
that workflow is updated in place rather than copied into the eval runner.

### Every contract has one current shape

Scenario, result, telemetry, model-configuration, judge, and sandbox contracts
have one accepted schema each. `schemaVersion` identifies that current shape;
it does not authorize reading an older one. When a shape changes, update its
Go owner and every checked-in consumer and fixture together, regenerate any
derived TypeScript surfaces, and remove the superseded fields and code.

Do not add migrations, old-field aliases, dual readers or writers, deprecated
scenario forms, legacy result importers, compatibility defaults, feature flags,
or silent fallback behavior. A stale scenario or result contract fails clearly
and is updated at its source. The eval runner is not a long-term archive reader;
past reports remain inert artifacts and are never made inputs to the current
runner.

### Scenarios are data, not programs

The initial layout is:

```text
evals/
  communication-rubric.md
  fixtures/
    typescript-service/
  models/
    screening.json
  scenarios/
    straightforward-task.json
    apparent-ambiguity.json
    genuine-ambiguity.json
    mid-run-steering.json
    queue-then-cancel.json
  verifiers/
    ...normal source files...
  sandbox/
    Dockerfile
cmd/setta-eval/
internal/evalharness/
scripts/run_setta_evals.sh
```

A scenario contains only typed inputs and expectations. It cannot contain an
arbitrary JSONPath predicate, a fixed sleep, or a large executable command
string. A small closed trigger catalog maps directly to existing events, such
as `director_turn_completed`, `agent_turn_running`,
`first_workspace_mutation`, `queue_nonempty`, and `run_terminal`. Adding a
trigger requires adding a typed runner implementation and validation.

For example:

```json
{
  "schemaVersion": 1,
  "id": "mid-run-steering",
  "fixture": "typescript-service",
  "timeoutSeconds": 300,
  "steps": [
    {
      "kind": "submit",
      "text": "Add a GET /health endpoint returning {\"ok\": true}."
    },
    {
      "kind": "submit_when",
      "trigger": "first_workspace_mutation",
      "text": "Change of plan: use /status instead and include the package version. Do not modify README.md."
    }
  ],
  "expect": {
    "terminalState": "completed",
    "clarification": "forbidden",
    "latestInstructionWins": true
  },
  "verifier": "status-endpoint",
  "budget": {
    "hardTotalTokens": 50000
  },
  "communication": {
    "progress": "when_useful",
    "finalResultRequired": true
  }
}
```

The number above is a runaway ceiling, not a claim that 50,000 tokens is good.
Regression thresholds are set only after the first baseline provides real
measurements.

All natural-language scenario messages enter through a `submit` Director
intent. The scenario never names an Agent conversation or invokes steer, queue,
or cancel APIs behind the Director's back. Whether the Director sends, steers,
queues, answers, or asks a useful question is exactly what the scenario is
measuring.

### One fixture, five scenarios

The first fixture is a small dependency-complete TypeScript HTTP service. Its
dependencies are present in the pinned ARM64 image, so the Agent does not need
general internet access or a package-install step. Each scenario receives a
fresh copy and an independent disposable git repository.

The first five scenarios are:

| Scenario | What it proves |
| --- | --- |
| Straightforward multi-step task | Correct multi-file work, command execution, restrained progress, truthful completion |
| Apparent ambiguity resolved by context | The Director inspects available context and starts useful work without involving the user |
| Genuine ambiguity | The Director does not mutate first, asks one useful question, consumes the scripted answer, and then succeeds |
| Mid-run steering | A follow-up sent after the first real mutation replaces the obsolete requirement |
| Queue then cancel | A second request is retained exactly once while work is active; cancelling the observed run stops it without losing or duplicating the queued request |

Recoverable provider failure, genuine external blocking, approvals, restart,
and more task domains are the next scenarios only after the vertical slice is
useful. They are not prerequisites for the MVP.

The genuine-ambiguity scenario does not detect questions by punctuation or
keywords. It waits for the Director turn to finish without starting or mutating
work, asserts that no mutation occurred, and supplies the declared answer. The
communication judge decides whether the returned prose was actually a targeted
question. In the apparent-ambiguity scenario there is no scripted answer, so a
Director that stalls for user input fails rather than receiving an eval-only
rescue.

### Deterministic grading owns outcomes and control

After the run reaches a terminal state, a hidden verifier checks the final
workspace. For the steering example it checks that `/status` exists, returns
the actual package version, `/health` does not exist, `README.md` is unchanged,
and no unrelated file changed.

The Agent never receives the scenario definition, verifier source, expected
answer, model comparison labels, or communication rubric. Verifier source is
not copied into or mounted in the Agent container.

Ability is binary. A failed hidden verifier is a failed task; communication or
low token usage cannot compensate for it.

User control is also graded from structured state and final artifacts wherever
possible:

- whether mutation preceded a required clarification;
- whether a context-resolvable request stalled for another user turn;
- whether a steering message was reflected in the end state;
- whether queued work was recorded once and ran in the correct order;
- whether mutating activity occurred after cancellation;
- whether the corrected requirement, rather than the original one, survived.

The runner does not prescribe a Director or Agent tool trajectory. Different
internal paths are acceptable when they reach the same correct state and honor
the same control contract.

### One judge owns only subjective communication

After deterministic verification, one fixed, exact model runs an existing
fresh structured call with read-only permission, no tools, and a strict JSON
schema. Judge tokens are recorded separately and never counted as Setta's task
cost.

The judge receives only:

- the scripted user messages;
- the Director replies and Narrator text that the product made user-visible;
- the scenario's small communication contract;
- the deterministic verifier result.

It does not receive private reasoning, raw provider messages, internal Agent
text, model identities, token totals, or the detailed execution trace.

Its result is five binary checks:

```json
{
  "progressSufficient": true,
  "progressRestrained": true,
  "questionsNecessary": true,
  "finalTruthfulAndActionable": true,
  "internalMechanicsHidden": true,
  "overallPass": true,
  "failureTags": []
}
```

There is deliberately no fixed minimum or maximum progress-message count. A
short task may need no interim message; a longer one may need several. The
rubric judges whether each interruption bought the user useful information.

Before the judge result is used for comparisons, the product owner reads the
five baseline transcripts and their five verdicts. This is a small sanity
check, not a labeling program or judge-calibration project.

### Efficiency is total tokens per successful task

The primary metric is first-attempt total system tokens for an objectively
successful scenario. Record input, cached input, output, reasoning output, and
total tokens by resolved role and model, plus the total across Director,
Narrator, Agent, and any Side Agent the run actually invoked.

The token observer consumes the typed `thread/tokenUsage/updated` notification
at the trusted Agent boundary. It attributes the last usage record for each
provider turn to the durable resolved invocation that owns that turn. It writes
ephemeral eval telemetry only; token evidence does not become a conversation
event, renderer contract, or durable product fact.

Dollar cost is not an MVP metric. Live Setta tests use ChatGPT authentication,
and Setta does not currently own an authoritative billed-price catalog. The
runner must not invent one or check in prices that will silently become stale.
If a future provider supplies authoritative cost metadata, the report may add
cost without replacing token totals.

Duration, model calls, reroutes, retries, and tokens emitted after cancellation
are diagnostics. A cheap failure is still a failure.

### Model comparison is a funnel

Every normal eval uses the exact production role configuration as its baseline.
Model-selection runs accept a checked-in or explicitly supplied candidate file
that changes no more than model, reasoning effort, and service tier through the
production role-configuration boundary.

The first screen tests at most one serious alternative per role:

1. production baseline;
2. alternative Director, baseline Narrator and Agent;
3. alternative Narrator, baseline Director and Agent;
4. alternative Agent, baseline Director and Narrator;
5. the winning combination;
6. one additional combination only when the first results show a real
   interaction, such as a stronger Director making a cheaper Agent viable.

Do not enumerate the provider catalog or build a Cartesian-product runner.
Dynamic task-based model routing is out of scope.

Ability and critical control scenarios are gates. Communication must not
regress. Among the remaining configurations, total tokens per successful task
is the decision metric and latency is a tiebreaker. A role being individually
cheap is not evidence that the whole system is cheap.

Each screening configuration runs each scenario once. A failed scenario is
rerun once:

- first run passes: `PASS`;
- both runs fail: `STABLE_FAIL`;
- one passes and one fails: `FLAKY`.

First-attempt success remains the headline. Only finalists run three times, and
only before a significant release or model decision. The judge model and rubric
remain fixed across every candidate and do not receive candidate names.

### Docker isolates actions, verifiers, and real developer state

The intended boundary is:

```text
Host
  scenario runner, scenario definitions, ChatGPT auth, judge, reports
       |
       | authenticated loopback control + typed events
       v
Disposable Agent container
  Setta backend, Codex runtime, disposable app data, fixture workspace

Disposable verifier container
  final workspace copy + hidden verifier, no model access
```

The exact provider-auth bridge is settled in Phase 0. The accepted design must
keep real credentials outside all AI-controlled filesystem and shell access. It
may use either a supported credentialless bridge to a host-owned provider
process or a supported separation between authenticated model control and
containerized tool execution. It may not depend on undocumented internal auth
protocols, mount the Codex auth store, or weaken the claim silently.

For each scenario, the runner creates Docker volumes for app data and the
fixture workspace, copies fixture contents in, and exposes only the backend's
ephemeral control port on host loopback. The repository, home directory, SSH
agent, cloud credentials, environment secrets, and Docker socket are never
mounted. The Agent container receives an explicit environment allowlist.

The Agent image is native ARM64 or multi-architecture and based on an exact,
digest-pinned image. It runs as a non-root user with a read-only root filesystem,
a writable workspace volume, temporary `tmpfs`, dropped capabilities,
`no-new-privileges`, no host ports except the loopback control port, and limits
for CPU, memory, processes, disk, wall time, and total tokens. General network
access is off. The MVP fixture requires no package downloads; only the narrow
provider control path established by Phase 0 is reachable.

Docker is an outer containment boundary, not a replacement for Setta's role
permissions. The Director and Narrator remain read-only and tool-free, and the
Agent retains the production workspace-write policy. Eval model configuration
may not grant broader permissions or change approval policy.

The verifier runs in a second disposable container after Agent execution. It
receives the final workspace and verifier source, with no credentials and no
network. AI-generated code is never executed directly on the host. The host
runner reads only the verifier's bounded JSON result and copies non-executable
artifacts into `.recordings/`.

Sandbox verification uses benign probes only: Docker configuration inspection,
a randomly generated canary outside the mounted volume, an unprivileged user
check, a harmless write inside the disposable workspace, a harmless denied
write outside it, and a request to a local fake endpoint that must be blocked.
It never runs destructive commands, and specifically never uses `rm -rf /` or
an equivalent command as a test.

The preflight checks Docker availability, daemon connectivity, architecture,
image identity, resource configuration, and ChatGPT auth availability. If
Docker Desktop is stopped, it reports exactly that and exits. It does not open
Docker Desktop, download a floating image, or fall back to unsandboxed work.

### Results are local, inspectable artifacts

Each invocation writes:

```text
.recordings/setta-eval/<timestamp>/
  manifest.json
  events.jsonl
  transcript.json
  token-usage.json
  verifier-results.json
  judge-results.json
  results.json
  report.md
```

The manifest records the Setta commit, scenario hashes, fixture hash, container
image digest, exact requested and resolved role configurations, judge model,
and runtime version. The event log contains typed public/semantic events and
accounting evidence only. It never records private model reasoning, raw auth
material, or unrestricted process environments.

The Markdown report has four sections—Ability, User Control, AI Communication,
and Efficiency—and a compact row per scenario. It does not calculate a single
weighted Setta score. Full JSON exists for later analysis, but no result
database or baseline service is built. The first comparison can be made by
reading two reports.

## Hard Rules

- No public benchmark integration in the MVP. Terminal-Bench, SWE-bench, and
  similar suites measure mostly Agent capability and bring their own sandbox
  infrastructure. Reconsider three to five handpicked tasks only after the
  Setta-native suite produces useful decisions.
- No destructive sandbox probes.
- No real repository, developer worktree, home directory, auth store, Docker
  socket, SSH agent, or cloud credential enters an Agent or verifier container.
- No fixed sleeps for scenario behavior. Timeouts exist only to terminate a
  stuck run.
- No new polling path. Existing HTTP event streams drive the scenario.
- No heuristic parsing of prompts, questions, commands, or output. Typed events,
  deterministic artifacts, and the communication judge own those decisions.
- No eval-only route directly to an Agent. User messages go to the Director.
- No verifier or expected answer is visible to the system under evaluation.
- No communication score compensates for an objectively failed task.
- No per-role token target is treated as the efficiency result. Per-role totals
  diagnose the total; they do not encourage token shifting.
- No single aggregate score.
- No automatic model search, dynamic model router, prompt optimizer, dashboard,
  evaluation database, synthetic user model, or multi-judge voting.
- No eval model configuration may change tools, workspace authority, or
  approval policy.
- No new provider merely to judge communication. Use one fixed exact model from
  the already integrated provider.
- No backward compatibility, legacy support, migrations, transitional adapters,
  feature-flagged old paths, dual-read/write behavior, field aliases, or second
  scenario/result schema. Replace unreleased contracts directly and delete the
  superseded implementation.

## Phase 0 — Prove the sandbox boundary

Timebox one focused day to establish how the ChatGPT-authenticated Codex runtime
can operate while every AI-controlled command stays in Docker and no credential
is readable there.

Build only enough to run one read-only model turn and one harmless fixture write
through the proposed boundary. Inspect mounts, environment, user, network, and
Docker configuration with benign canaries. Record the chosen topology and its
security assumptions in this plan before proceeding.

This phase can fail. If the current Codex runtime offers no supported way to
separate ChatGPT auth from tool execution, stop and report the blocker. The
Docker eval does not ship until the requirement changes explicitly or a
credential-safe boundary is funded. Do not add an unsandboxed fallback, a
temporary host-execution mode, or a second transitional runner. Do not mount
auth and label the result safe, and do not build against an internal-only auth
protocol.

**Exit:** one live, mutating throwaway task runs on the target MacBook; the real
repository and a random host canary remain unreachable; no real credential is
present in the Agent filesystem or environment; teardown leaves no process or
container running.

## Phase 1 — One vertical scenario

Add the Go-owned scenario contract, `cmd/setta-eval`, the shell entrypoint, the
pinned ARM64 sandbox image, one TypeScript fixture, and the straightforward
scenario.

The runner validates every input, creates disposable volumes, starts the real
backend, opens the fixture through `/workspaces/open`, reads the production
baseline role configuration, submits the user message to the Director,
subscribes to Director and conversation events, waits for typed terminal state,
and invokes the separate verifier container. It always tears down the backend,
provider, containers, volumes, and subscriptions, including on cancellation or
failure.

At this phase the report contains objective outcome, resolved models, duration,
and infrastructure diagnostics. Do not add the judge or model matrix until one
scenario can run repeatedly without harness ambiguity.

**Exit:** one command produces a correct `results.json` and `report.md` for one
passing run, one intentionally incorrect final workspace, one timeout, and one
infrastructure failure, with each classified differently.

## Phase 2 — Token evidence and the communication judge

Give `thread/tokenUsage/updated` an ephemeral accounting sink at the Agent
boundary. Correlate provider turns to resolved invocations, preserve the exact
provider breakdown, and prove repeated usage updates are not double-counted.
Keep judge usage in a separate accounting bucket.

Build the user-visible transcript from the same Director receipts and Narrator
public text that the renderer consumes. Add the fixed fresh structured judge
and its five-Boolean result schema. Write the complete local artifact set under
`.recordings/setta-eval/`.

**Exit:** the first scenario reports exact system tokens by role and total,
excludes judge tokens, and receives a schema-valid judge result whose verdict
the product owner has read against the transcript.

## Phase 3 — Complete the five-scenario MVP

Add apparent ambiguity, genuine ambiguity, steering, and queue-then-cancel on
the same fixture. Add only the event trigger and deterministic assertion
vocabulary those scenarios require.

Run once by default and rerun only failed scenarios once. Report first-attempt
passes, stable failures, flaky scenarios, infrastructure failures, user-control
assertions, communication checks, and token totals. Establish generous hard
runaway caps from observed data; do not yet automate baseline regression
thresholds.

**Exit:** all five scenarios can be launched together or individually, every
failure is attributable to ability, control, communication, efficiency, or
infrastructure, and no scenario relies on timing luck.

## Phase 4 — Screen model combinations

Add a small model-configuration input that applies exact production role
profile updates before a scenario begins and records both requested and resolved
settings. It must validate candidates against the live model catalog and fail
specifically when a model, effort, or service tier is unavailable.

Run the baseline and one-at-a-time Director, Narrator, and Agent alternatives,
then the combined winner. Do not add candidates until the product owner has a
specific model decision to make.

**Exit:** one report set makes it possible to choose a static production trio
from ability, control, communication, total tokens per successful task, and
latency without a Cartesian search or a blended score.

## Phase 5 — Add scenarios only from evidence

After the MVP, every material real-world failure should be considered for a
scenario. Add it only when it represents a reusable product contract and has an
objective verifier or a narrow communication contract.

The next likely additions are recoverable Worker failure, genuine external
blocking, approvals, backend restart with queued work, and a second task domain.
Public benchmark tasks remain optional monthly capability checks rather than an
initial merge gate.

## Verification policy

Writing and implementing this plan does not authorize automated tests. During
implementation, formatting changed files is allowed. When the branch is ready
to merge and the user explicitly requests verification, start with the narrowest
checks for the scenario parser, token accounting, sandbox preflight, and one
fixture verifier.

Because this work touches provider handling, role configuration, Director
dispatch, conversation lifecycle, queueing, steering, cancellation, streaming,
and persistence, merge verification must then include the existing deterministic
production Electron/main/preload/renderer/HTTP/store workflows with temporary
app data. It must also run the applicable live Codex E2E matrix using local
ChatGPT auth with `OPENAI_API_KEY` absent. If ChatGPT auth is unavailable, report
the live skip without treating deterministic success as provider proof.

No verification may mutate the real repository history or a non-disposable
developer worktree.

## Effort guardrail

If Phase 0 finds a supported sandbox path, the target is one focused week:

- sandbox proof and preflight: one day;
- vertical runner and verifier: two days;
- token observer, judge, and artifacts: one to two days;
- four remaining scenarios and model input: one to two days.

That is a guardrail, not a promise. If credential-safe Docker requires a new
provider proxy, remote execution system, or undocumented Codex integration,
the MVP stops at the Phase 0 decision instead of turning into an evaluation
platform project or shipping a transitional execution path.
