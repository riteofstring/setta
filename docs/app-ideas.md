# Setta Workspace App Ideas

## Purpose

Setta currently has two applications built on `@setta/workspace`:

- Python Canvas turns Python callables, parameters, lists, generated code, diagnostics, and local
  execution into a durable visual project.
- Realtime connects authored interfaces to ordinary Python handlers and presents live pipelines,
  streamed results, retained outputs, and artifacts.

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
| Setta Runbook      | Executions and approvals                          |
| Investigation Desk | Sources, claims, annotations, and findings        |

If an idea is fundamentally inputs flowing through Python handlers to outputs, it is probably a
Realtime example or starter project. A separate app becomes worthwhile when users need a different
history, lifecycle, collaboration model, or source of truth.

## Recommended flagship: Setta Bench

Setta Bench would be an experiment and evaluation workbench. Users would combine datasets,
prompts or configurations, scripts, models, and evaluation criteria; run individual trials or
sweeps; inspect progress; compare results; and fork or replay a promising run.

The central product would be a visible run ledger rather than a transient collection of outputs.
A useful run would retain its inputs, source revision, environment, status, timing, logs, metrics,
artifacts, errors, and lineage. Users should be able to search, compare, replay, fork, and cite runs
as part of normal work.

Bench fits Workspace particularly well:

- typed controls can make trial configuration approachable;
- data and workflow edges can make evaluation flow legible;
- saved views can provide distinct Build, Monitor, and Review perspectives;
- floating windows and Window Spaces can support side-by-side result comparison;
- text and code surfaces can hold prompts, rubrics, scripts, and reports;
- diagnostics can make invalid or incomplete trials visible in context;
- result surfaces can present tables, charts, images, logs, and other artifacts.

An AI evaluation harness is the strongest initial use case: combine a dataset, prompt, model
configuration, and grader, then compare quality, cost, latency, failures, and representative
outputs across runs. Bench should nevertheless remain general enough for parameter studies, data
experiments, benchmarks, and other reproducible local jobs.

This idea recombines some of the most coherent parts of the old Setta: parameter sweeps, variants,
prompts, spreadsheets, charts, artifacts, and `AgentRun` history. The old product strategy also
identified a first-class run ledger and an AI evaluation harness as especially promising.

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

## Ideas that fit Realtime better

Several appealing experiences do not initially need separate applications. They naturally match
Realtime's input-to-handler-to-output model and would be better explored as polished examples or
starter projects:

- a creative media studio for drawings, prompts, image treatments, compositing, and variant
  comparison;
- a dashboard for local models, simulations, sensors, devices, or other continuously updating
  processes.

These examples can still exercise rich Workspace capabilities. They simply do not need a new
product boundary until they require their own durable history or domain-specific lifecycle.

## Suggested order

1. **Setta Bench** is the strongest third flagship. It adds a genuinely new product center—a run
   ledger with comparison and reproducibility—while exercising most of Workspace's distinctive
   surfaces.
2. **Setta Runbook** is a natural next step once durable runs exist, extending them with workflow
   state, approvals, and operator presentation.
3. **Investigation Desk** is a strong exploratory direction if a more spatial,
   knowledge-oriented product is desirable.

## Product guardrail

The old Setta demonstrated that Workspace can host an enormous number of capabilities. Future apps
should use that flexibility to make focused products rather than to rebuild one application that
contains everything. Each app should have a clear user, a recognizable recurring job, and a
durable source of truth. Shared UI primitives can remain broad; the applications built from them
should remain opinionated.
