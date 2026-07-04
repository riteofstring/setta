# Transcript Virtualization Performance

## 2026-05-30 Baseline Before Virtualization

Scenario: transcript component rendering a loaded conversation page with 5,000
assistant messages and no run activity.

Measurement source: code-derived baseline from the previous transcript render
path, which rendered `messages.map(...)` directly into the scroll container.

Results:

- Message rows in DOM: 5,000
- Run activity lookup per assistant row: filtered the full `runItems` array by
  `runId`
- Run output lookup per activity row: filtered the full `runItemOutputs` array
  by `runItemId`

## 2026-05-30 After Virtualization And Indexed Lookups

Scenario: same 5,000-message transcript shape exercised by
`desktop/src/renderer/src/App.test.tsx`.

Measurement command:

```sh
pnpm -C desktop test
```

Results:

- Message rows rendered by the large transcript fixture: <= 30
- Run activity lookup per assistant row: indexed by `runId`
- Run output lookup per activity row: indexed by `runItemId`
- Store state maintains message IDs, messages by ID, run items by run ID, and
  run item outputs by run item ID
