# Setta Experiment Lens

Experiment Lens opens recorded experiment results, links population views to exact observations
and artifacts, and exports a portable selection for the next person or tool. It does not launch,
schedule, or track experiments.

Any agent harness, script, notebook, or experiment system can write the same versioned manifest.
Lens contributes a focused read-and-handoff workflow: find the observations that matter, preserve
their exact evidence, and continue elsewhere without translating the investigation into prose.

## Playground

The checked-in playground is an accelerated battery-aging study with 864 observations across 24
cells, three chemistries, multiple charge rates and chamber temperatures, and 900 cycles. It links
the population and virtualized table to per-cell aging trajectories and thermal frames captured at
five cycle checkpoints.

Complete the [source setup](../../CONTRIBUTING.md#source-setup), then run it from the repository root:

```console
pnpm experiment-lens:playground
pnpm experiment-lens:playground --no-open
```

The **Start here** pane gives you a small investigation: filter test conditions, select observations to compare, and inspect a cell over time. Its buttons switch views and frame the relevant controls. This simulated study remains unchanged while you explore.

Add `--no-open` to print the URL without opening a browser, or `--fresh` to start another example
without deleting your previous work. The launcher prints a `--workspace` command to resume that
exact copy. The command returns when the app is ready; you can close the terminal. Running it
again reopens the same live playground. Stop it with `pnpm experiment-lens:playground --stop`,
or add `--workspace PATH --stop` for another copy. Reopen the guide with **Start here** in the
left sidebar.

The launcher builds Experiment Lens, seeds `tmp/experiment-lens-playground/experiment-project`
from the immutable fixture, and opens the app. Later launches preserve filters, focus, selections,
ranges, and annotations in that ignored working copy. Use `--fresh` to start again while keeping this copy.

If a selection save fails or conflicts with another writer, Lens keeps your visible draft and
pauses saving. **Save draft** retries against the freshly loaded revision; **Use saved selection**
discards the draft and loads the saved selection. Export waits until the draft is saved, and the
browser warns before closing an unsaved draft. An initial load failure offers **Try again**.

## Commands

The local build exposes these commands without an agent-specific SDK. Use its `setta` executable
or substitute the repository-local runner described in the contributor guide:

```console
setta experiment-lens open --project-root ./my-experiment
setta experiment-lens schema --pretty
setta experiment-lens snapshot --project-root ./my-experiment --pretty
setta experiment-lens apply --project-root ./my-experiment --file mutation.json --pretty
setta experiment-lens export --project-root ./my-experiment --output selection.json --pretty
```

`open` owns one foreground, loopback-only session. `snapshot` and `apply` use that live session when
one exists and otherwise operate locally. Every mutation names the experiment, exact manifest and
observation-source digests, and observed revision. Lens never silently rebases a stale selection or
retries an indeterminate write.

Project, CLI, HTTP, and state inputs share one strict lexical contract: valid UTF-8, one JSON value,
unique object keys, at most 32 nested containers, and at most 8 MiB per decoded string, field name,
or number, within each boundary's smaller byte limit. Closed contract documents also reject unknown
fields before Lens applies semantic validation.

## Project format

An Experiment Lens project is ordinary, portable files:

```text
my-experiment/
  experiment.json
  data/
    observations.json
  artifacts/
    trajectories/
      cell-01.json
    thermal/
      cell-01-cycle-0900.png
```

`experiment.json` declares ordered factor and metric fields, one content-addressed observation
source, content-addressed local artifacts, relations from stable observation IDs to those
artifacts, producer provenance, and a declarative presentation. The presentation chooses built-in
section types, binds them to fields or artifact roles, and places them exactly in named views:

```json
{
  "presentation": {
    "initialViewId": "overview",
    "sections": [
      {
        "id": "condition-heatmap",
        "title": "Mean retention by test condition",
        "type": "heatmap",
        "xFieldId": "charge_rate_c",
        "yFieldId": "ambient_c",
        "valueFieldId": "capacity_retention_pct",
        "aggregation": "mean"
      }
    ],
    "views": [
      {
        "id": "overview",
        "name": "Overview",
        "viewport": { "x": 320, "y": 12, "zoom": 0.76 },
        "placements": [
          {
            "sectionId": "condition-heatmap",
            "x": 64,
            "y": 64,
            "width": 1320,
            "height": 430
          }
        ]
      }
    ]
  }
}
```

The contract supports facets, scatter, histogram, heatmap, parallel-coordinate, table, aggregate
metrics, standardized timeline, and artifact-gallery sections. A gallery presents one related
artifact at a time with previous/next controls and a thumbnail strip. It does not admit React code,
expressions, arbitrary chart options, commands, remote URLs, dependencies, or plug-in discovery.
Run `setta experiment-lens schema --pretty` for the complete versioned contract.

The optional `setta-series/v1` envelope describes one numeric axis, named numeric series, and
samples. A relation can anchor another artifact to an exact value on that axis. Lens also admits
bounded text and JSON plus passive images, audio, and video. Other artifact types remain inert
downloads. Every path stays inside the project root, and changed bytes fail visibly instead of
silently replacing admitted evidence.

## Workspace behavior

Lens renders the sections and named views declared by the manifest. A producer can make an Overview
of facets, aggregate metrics, scatter, histogram, and heatmap; a Compare view of parallel
coordinates and a virtualized table; and an Inspect view of standardized timelines and related
artifacts. These are examples, not fixed view names or layouts. The same section can appear in
multiple views at a different position and size. Projects compose the nine built-ins but never
supply executable section code.

Filters, focus, the comparison basket, selected artifacts, ranges, and annotations are shared
durable state. Selecting a point or row focuses the same observation everywhere. Annotation mode
maps scatter points, histogram bars, and heatmap cells to the exact observations they represent.
Selecting an active mark again removes its observations; Shift adds or removes groups without
discarding the rest of the basket. Every chart can capture normalized freehand strokes plus text
marked as context, a question, or a follow-up request.
Artifact views accept the same typed annotations with an exact artifact anchor. A series pointer
snaps to the nearest sample and drives any artifact related to that axis. Choosing a timed gallery
artifact moves that same series cursor, so the timeline and gallery stay bidirectionally linked.
Activating a declared
view applies its section set, geometry, and viewport, while a managed window compares up to four
selected trajectories and metrics. The full basket remains available for export.

User changes to Workspace layout, chart hover, playback cursor, axis choices, and window geometry
are local presentation state. A selected series range is durable and content-addressed with the
rest of the exploration selection. There are no decorative graph edges: coordinated views
communicate through their shared selection directly.

## Durable output

Mutable exploration state lives in `.local/experiment-lens/state.json`, separate from the immutable
producer inputs. Projects should ignore `.local/experiment-lens/`; the checked-in playground keeps
its mutable copy beneath the repository's ignored `tmp/` directory. `export` writes one versioned
selection packet containing source identities, filters, every selected or annotation-referenced
observation and its values, exact artifact references, ranges, and structured annotations. Chart
annotations include their originating section and view, field bindings, filters, observation IDs,
intent, text, and normalized vector strokes. Python Canvas or ordinary experiment code can produce
a project; Setta Review or any arbitrary tool can consume the packet.

Experiment Lens does not execute project code, load third-party components, contact a tracker,
control an agent, edit results, launch a sweep, tune parameters, or replace TensorBoard, MLflow,
W&B, Streamlit, or domain-specific viewers. Its narrow purpose is linked local investigation and
precise handoff over already-recorded results.
