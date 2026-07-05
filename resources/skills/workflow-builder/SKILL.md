---
name: workflow-builder
description: Author, validate, save, inspect, and optionally run Setta workflow definitions through the `setta workflow` CLI. Use when an agent needs to create or update a Setta workflow graph, repair workflow validation diagnostics, inspect the current Setta workspace or workflow schema, save a workflow definition, or start/read workflow executions.
---

# Workflow Builder

## Overview

Use the Setta workflow CLI as the authority for workflow authoring. The backend owns schema, validation, persistence, IDs, runtime authorization, audit records, and execution state.

Do not write `.setta/workflows/*.json` directly as the primary workflow authoring path. Use `setta workflow schema` for the current graph fields, node shapes, actions, value sets, and permission presets.

## Workflow

1. Resolve the active Setta workspace:

   ```bash
   setta workflow current-workspace
   ```

2. Read the authoritative workflow schema:

   ```bash
   setta workflow schema
   ```

   Treat `graphSchema`, `valueSets`, `actions`, and `permissionPresets` from this command as current truth. If the requested workflow needs a node type, action kind, capability, permission preset, or graph field that is absent, stop and report the unsupported requirement.

3. Draft the graph in a JSON file using the schema response. Use structured JSON tooling when practical. Do not infer contracts from old examples, UI labels, or keyword matching.

4. Validate the graph before any save:

   ```bash
   setta workflow definitions validate --graph graph.json
   ```

5. Repair diagnostics from the JSON validation result and validate again. Use diagnostic `code`, `message`, `nodeId`, and `edgeId` fields directly. If validation still fails after a reasonable repair pass, stop with the structured diagnostics.

6. Save only when the user asked to create or update a workflow:

   ```bash
   setta workflow definitions save --input save.json
   ```

   The save input is an explicit create/update request. Use `operation: "create"` with `definitionId` omitted or empty, or `operation: "update"` with the existing definition ID. Include `name`, `description`, and the validated `graph`. The save result also contains backend validation; treat `saved: false` as not persisted.

7. Start a workflow only when the user explicitly requested a run:

   ```bash
   setta workflow executions start <definition-id>
   setta workflow executions read <execution-id>
   ```

## CLI Reference

Available commands:

- `setta workflow current-workspace`
- `setta workflow schema`
- `setta workflow definitions list`
- `setta workflow definitions read <definition-id>`
- `setta workflow definitions validate --graph <path>`
- `setta workflow definitions save --input <path>`
- `setta workflow executions start <definition-id>`
- `setta workflow executions read <execution-id>`

Each command accepts `--app-data-dir DIR` before command-specific positional IDs when targeting a non-default Setta runtime. Command success prints JSON to stdout. Workflow command failures print a JSON error envelope to stderr; preserve the error code, message, and structured fields in your response.

## Failure Policy

Fail loudly when:

- the `setta` CLI is unavailable
- no Setta runtime or active workspace is available
- runtime authorization fails
- the schema cannot be read
- validation diagnostics cannot be repaired
- the requested workflow requires unsupported schema capabilities
- save returns `saved: false` or a structured backend error
- starting an execution returns a structured backend error

Report the exact CLI command attempted and the relevant JSON error or validation diagnostics. If validation or save fails, stop and report the CLI output instead of creating workflow files by hand.
