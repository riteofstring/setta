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

Run it from the repository root:

```console
pnpm experiment-lens:playground
pnpm experiment-lens:playground -- --no-open
```

The launcher builds Experiment Lens, seeds `tmp/experiment-lens-playground/experiment-project`
from the immutable fixture, and opens the app. Later launches preserve filters, focus, selections,
ranges, and notes in that ignored working copy. Remove that working directory to reset the example.

## Commands

An installed Setta release exposes the same app without an agent-specific SDK:

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
artifacts, and producer provenance. It contains no layout, React code, chart options, commands,
remote URLs, or plug-in declarations.

The optional `setta-series/v1` envelope describes one numeric axis, named numeric series, and
samples. A relation can anchor another artifact to an exact value on that axis. Lens also admits
bounded text and JSON plus passive images, audio, and video. Other artifact types remain inert
downloads. Every path stays inside the project root, and changed bytes fail visibly instead of
silently replacing admitted evidence.

## Workspace behavior

Lens selects from six built-in section types according to the manifest: cohort facets, population
scatter, parallel relationships, a virtualized observation table, standardized recorded series,
and an artifact viewer. A sparse experiment may show only the table; projects never supply
executable section code.

Filters, focus, the comparison basket, selected artifacts, ranges, and notes are shared durable
state. Selecting a point or row focuses the same observation everywhere. A series pointer snaps to
the nearest sample and drives any artifact related to that axis. Atlas and Inspect saved views
rearrange the same applicable sections, while a managed window compares up to four selected
trajectories and metrics. The full basket remains available for export.

Workspace layout, chart hover, playback cursor, axis choices, and window geometry are local
presentation state. A selected series range is durable and content-addressed with the rest of the
exploration selection. There are no decorative graph edges: coordinated views communicate through
their shared selection directly.

## Durable output

Mutable exploration state lives in `.local/experiment-lens/state.json`, separate from the immutable
producer inputs. Projects should ignore `.local/experiment-lens/`; the checked-in playground keeps
its mutable copy beneath the repository's ignored `tmp/` directory. `export` writes one versioned
selection packet containing source identities, filters, every selected observation and its values,
exact artifact references, ranges, and notes. Python Canvas or ordinary experiment code can produce
a project; Setta Review or any arbitrary tool can consume the packet.

Experiment Lens does not execute project code, load third-party components, contact a tracker,
control an agent, edit results, launch a sweep, tune parameters, or replace TensorBoard, MLflow,
W&B, Streamlit, or domain-specific viewers. Its narrow purpose is linked local investigation and
precise handoff over already-recorded results.
