# Python Canvas AI-native intent operation plan

## Objective

Make a common AI-authored callable workflow one CLI operation instead of a dependent sequence of create, commit, refresh, and parameter-update commands.

The first intent-level operation creates a callable with an expression and zero or more parameter values. The backend resolves the signature, binds values by provider parameter name, validates the complete result, persists it once, and publishes one final project snapshot.

Success is measured primarily in AI tool turns: one `apply` invocation must replace the current four-command workflow.

## Public contract

Add this operation without changing the semantics of the existing browser or CLI operations:

```json
{
  "operation": "callable.createConfigured",
  "name": "Ceiling",
  "authoredExpression": "math.ceil",
  "parameterValues": {
    "x": "7.25"
  }
}
```

Contract rules:

- `name` and `authoredExpression` are required, nonblank strings.
- `parameterValues` is an optional object whose keys are exact resolved Python parameter names and whose values are authored Python expressions. Omitting it is equivalent to `{}`.
- Provider-owned parameter IDs, order, passing style, annotations, and defaults remain server-owned.
- Every supplied parameter name must exist in the resolved signature. Unknown names fail the whole operation.
- Resolved parameters omitted from `parameterValues` remain empty and may receive normal required-value diagnostics.
- The CLI binds the operation to the fetched project ID and revision and never retries a revision conflict.
- `apply` continues returning the canonical project snapshot. A general receipt/output redesign is a separate concern.

Use a distinct semantic HTTP request/route and service/coordinator method for this all-or-nothing workflow. Do not overload the existing empty-callable creation contract or change the browser's durable expression-commit behavior.

## Transaction boundary

The aggregate owns a narrowly scoped prepare/finalize workflow:

1. Validate the create-configured command against the current project and revision.
2. Clone the aggregate and allocate the callable ID in an unpublished draft without incrementing the revision.
3. Ask the existing signature provider to resolve the authored expression against temporary code rendered from that draft.
4. Allocate the resolved parameter items and apply requested values by exact parameter name.
5. Validate the completed aggregate and produce one changed candidate, incrementing the revision exactly once.
6. Use the coordinator's existing `applyCandidate` transaction to render, stage, install, commit, diagnose, and publish exactly once.

Do not compose the existing public create, commit, refresh, and set-parameter mutations. They each own a separate revision and publication lifecycle and therefore cannot implement this atomic intent.

Provider resolution, parameter binding, aggregate validation, rendering, staging, or persistence failure must leave the project file and published snapshot unchanged. Consuming an unused generated ID on failure is acceptable; persisting a partial callable is not.

## Implementation ownership

### Domain and coordination

- Add typed configured-callable commands and prepared state to `backend/internal/project/aggregate`.
- Keep name-to-parameter matching and final aggregate invariants in the aggregate.
- Add one coordinator entry point that holds the normal mutation lock, uses the existing temporary signature-render path, and calls `applyCandidate` once.
- Keep provider, persistence, rendering, and publication mechanics in their current owners.

### Delivery and generated contracts

- Add a V2 request type and one semantic collection route in `backend/internal/contracts` and regenerate the TypeScript contract.
- Add a thin HTTP payload, service method, and handler that map the request to the coordinator command.
- Register `callable.createConfigured` in the CLI schema and bind it to the new route.
- Preserve all existing operation names, request shapes, and behavior.

### Documentation

- Document the one-command example in the CLI help/schema surface that agents inspect.
- Keep this plan focused on the configured-callable intent. Do not introduce recursive planning instructions.

## Verification

Focused tests must prove observable behavior rather than repeat implementation logic:

1. One CLI `apply` invocation can create `math.ceil` with `x` set to `7.25`.
2. A successful configured creation increments the project revision exactly once.
3. Subscribers observe one final publication containing the callable, resolved parameter, and supplied value; no empty or half-configured callable is published.
4. The project file is replaced once with the final state and contains no intermediate state.
5. An unknown supplied parameter name returns a typed validation failure and makes no persistence or publication change.
6. A provider/signature failure returns the existing typed provider failure and makes no persistence or publication change.
7. Omitting a required resolved parameter is allowed; the final snapshot contains the empty parameter and its normal diagnostic.
8. Existing `callable.create`, `callable.commit`, `callable.refreshParameters`, and `parameter.setValue` behavior remains unchanged.
9. Generated Go/TypeScript contracts remain current and the frontend builds.

After focused tests, run the changed-scope Code Polishy suite. Finally, exercise the operation against a temporary headless app and verify that the pushed browser state appears once in its final configured form.

## Explicit non-goals

- A generic batch transaction language.
- Aliases or references to outputs of earlier operations.
- Client-side sequential batching presented as atomic.
- A global CLI receipt or output-format redesign.
- Configured param-dict or list-root creation.
- Python environment, packaging, variants, views, or project-config work.
- Broad edge-case auditing unrelated to this concrete callable lifecycle.

## Completion checklist

- [x] The public request and CLI schema describe `callable.createConfigured`.
- [x] The aggregate produces one final candidate and one revision increment.
- [x] The coordinator persists and publishes only the final result.
- [x] Failure paths are atomic and typed.
- [x] Focused aggregate, coordinator/publication, HTTP, contract, and CLI tests pass.
- [x] Generated TypeScript is current and the frontend builds.
- [x] The changed-scope policy suite was exercised and the headless push acceptance passes. The policy command's only failure is the repository's pre-existing expired vulnerability-assessment metadata.
