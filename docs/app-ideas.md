# Setta Workspace App Ideas

## Purpose

Setta currently has three applications built on `@setta/workspace`:

- Python Canvas turns Python callables, parameters, lists, generated code, diagnostics, and local
  execution into a durable visual project.
- Realtime connects authored interfaces to ordinary Python handlers and presents live pipelines,
  streamed results, retained outputs, and artifacts.
- Setta Bench compares code-backed candidates against the same repeatable cases and retains
  inspectable runs, checks, and artifacts.

This document collects ideas for additional applications that could reuse the Workspace UI while
remaining focused products. It is an ideas document, not an implementation plan.

## Historical inspiration

The local `main` branch at commit `043d3b2e9c69caf99d1246f1408b3ad7194b7864` represented a much
broader version of Setta. It included several clusters of functionality that can inspire smaller,
more coherent applications:

- parameter sweeps, variants, persisted agent runs, artifacts, and run metadata;
- prompt and chat sections, project chat, scoped agentic edges, and AI-follow behavior;
- state-machine workflows, gates, signals, and workflow run controls;
- builder-facing and operator-facing views, tabbed views, and saved window arrangements;
- JSON, YAML, and TOML source sections backed by real files;
- a file browser with universal previews and spreadsheet editing;
- Git status, diffs, commit history, graph views, and worktree summaries;
- task boards, spreadsheets, charts, images, drawing, browser, terminal, and text surfaces;
- meta controls that presented one approachable control over several lower-level values.

The useful lesson is not to recreate that universal application. The old feature set contains
several strong vertical products that can now be separated and given clearer identities.

## When an idea should become its own app

A standalone application should own a distinct durable concept, not merely arrange Workspace
sections differently.

| Application        | Durable concept                                   |
| ------------------ | ------------------------------------------------- |
| Python Canvas      | A Python project                                  |
| Realtime           | A live handler graph and its materialized outputs |
| Setta Bench        | Experiments and runs                              |
| Config Studio      | Configuration revisions and environments          |
| Setta Runbook      | Executions and approvals                          |
| Agent Room         | Agent sessions, scopes, and review history        |
| Investigation Desk | Sources, claims, annotations, and findings        |

If an idea is fundamentally inputs flowing through Python handlers to outputs, it is probably a
Realtime example or starter project. A separate app becomes worthwhile when users need a different
history, lifecycle, collaboration model, or source of truth.

## Implemented sibling: Setta Bench

Setta Bench is a focused local comparison workbench. Users define one bounded case set, a few
explicit command candidates, and shared checks; launch one run per candidate; inspect durable
progress and artifacts; and compare the same case from two terminal runs.

The central product is a small visible run ledger rather than a transient collection of outputs.
A run retains its frozen inputs, source revision, status, timing, bounded logs, observations,
artifacts, and errors. Users can compare, review, and rerun it; search, branching, sweeps, and a
general lineage model stay outside the application.

Bench fits Workspace particularly well:

- section cards and data edges make the comparison definition legible;
- saved-view tabs provide distinct Build, Runs, and Compare perspectives;
- managed windows support side-by-side artifact comparison;
- native panes and Inspector keep launch, run, case, and review detail in the Workspace shell; and
- diagnostics make an invalid comparison visible before it launches.

The first use case compares two CPU-only image-thumbnail strategies across ten product images.
The data model and process protocol remain neutral enough for other code-based comparisons without
adding machine-learning concepts, hosted providers, or a dashboard framework.

This idea recombines some of the most coherent parts of the old Setta: parameter sweeps, variants,
prompts, spreadsheets, charts, artifacts, and `AgentRun` history. The old product strategy also
identified a first-class run ledger and an AI evaluation harness as especially promising.

## Config Studio

Config Studio would turn JSON, YAML, and TOML files into understandable, validated control
surfaces. Users could browse configuration, edit values through appropriate controls, compare
environments, inspect validation issues, preview changes, and deliberately write an accepted
revision back to its source file.

The application could make complicated configuration approachable without hiding the real file.
It would be especially useful for model settings, service configuration, feature flags, build
profiles, deployment manifests, and open-source tools with large configuration surfaces.

This idea draws from the old JSON-source sections, meta controls, variants, file browser, Git
diffs, and parameter diagnostics. It is likely the quickest practical application to deliver
because its user story is narrow and its value does not depend on AI.

## Setta Runbook

Setta Runbook would be a visual operations and human-in-the-loop workflow application. A runbook
could combine commands, checks, decisions, approvals, retries, logs, and produced artifacts. Users
would start a run, see exactly where it is waiting or failing, approve sensitive transitions, and
retain a complete record of what happened.

Builder views could expose the complete workflow, while operator views could show only the current
step, relevant controls, status, instructions, approvals, and results. This makes the saved-view
and standalone-surface capabilities part of the product rather than optional layout features.

The inspiration is the old state-machine graph, gate nodes, structured signals, workflow runs,
operator-facing view modes, terminal surfaces, backend logs, and artifacts. The focused product
story would be operational runbooks and approvals rather than generic visual programming.

## Agent Room

Agent Room would make agent work visible, scoped, and reviewable. Users could arrange agents,
tasks, context sources, writable targets, tools, and approval boundaries. Links would explain which
information an agent can read, which surfaces it may change, and which peer agents it may consult.

The product would emphasize supervision rather than merely providing another chat interface. Its
history would show prompts, tool calls, costs, artifacts, file changes, decisions, approvals, and
handoffs. A reviewer could understand both what an agent produced and the authority under which it
acted.

This idea revives the old chat sections, project chat, agentic edges, MCP scoping, workflow gates,
AI Follow, approvals, Git diffs, and persisted agent runs. It is the most ambitious candidate and
would be most compelling after a general run ledger and approval model have proven themselves.

## Investigation Desk

Investigation Desk would be a local-first research and evidence workspace. Users could collect
PDFs, images, spreadsheets, logs, web captures, and notes; place related material together;
connect sources to claims; annotate evidence; assemble timelines; and compare findings in saved
layouts.

Scoped assistants could summarize selected sources, extract entities, identify contradictions, or
draft a report without receiving unrelated material. A dedicated review view could present the
final claims and their supporting sources without exposing the entire working canvas.

The old file browser, universal preview, artifact system, text and media sections, spreadsheets,
charts, browser surfaces, agentic edges, saved views, and Window Spaces all contribute to this
concept. It is one of the most naturally spatial and visually distinctive uses of Workspace.

## Repo Atlas

Repo Atlas would be a visual companion for understanding and reviewing a codebase. It could bring
together files, code excerpts, diagnostics, Git history, diffs, worktrees, commands, documentation,
tasks, and review agents in saved project maps.

The old Setta already had strong pieces of this experience: a file browser, universal preview,
Git status and diffs, a commit graph, worktree summaries, terminals, task boards, LSP diagnostics,
and project-level AI. A focused descendant could be useful for onboarding, change review, and
architecture exploration.

This is a lower-priority flagship because the market already contains many capable coding and
agent environments. Repo Atlas is most interesting as a structured visual companion, not as an
attempt to replace an editor or become another general coding-agent control plane.

## Ideas that fit Realtime better

Several appealing experiences do not initially need separate applications. They naturally match
Realtime's input-to-handler-to-output model and would be better explored as polished examples or
starter projects:

- a creative media studio for drawings, prompts, image treatments, compositing, and variant
  comparison;
- an API flow lab for requests, authentication, environments, assertions, and response inspection;
- a data transformation workbench for files, cleaning steps, tables, charts, and exported results;
- a dashboard for local models, simulations, sensors, devices, or other continuously updating
  processes;
- an interactive report generator that turns controls and source material into retained documents
  or media artifacts.

These examples can still exercise rich Workspace capabilities. They simply do not need a new
product boundary until they require their own durable history or domain-specific lifecycle.

## Suggested order

1. **Setta Bench** is the strongest third flagship. It adds a genuinely new product center—a run
   ledger with comparison and reproducibility—while exercising most of Workspace's distinctive
   surfaces.
2. **Config Studio** is the quickest focused win. It has a clear audience, a bounded promise, and
   substantial value without depending on external providers.
3. **Setta Runbook** is a natural next step once durable runs exist, extending them with workflow
   state, approvals, and operator presentation.
4. **Agent Room** becomes much stronger after the run and approval foundations exist.
5. **Investigation Desk** and **Repo Atlas** are strong exploratory directions if a more spatial,
   knowledge-oriented, or developer-oriented product is desirable.

## Product guardrail

The old Setta demonstrated that Workspace can host an enormous number of capabilities. Future apps
should use that flexibility to make focused products rather than to rebuild one application that
contains everything. Each app should have a clear user, a recognizable recurring job, and a
durable source of truth. Shared UI primitives can remain broad; the applications built from them
should remain opinionated.
