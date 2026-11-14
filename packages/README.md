# Shared package

Setta publishes [`@riteofstring/setta`](workspace/README.md): the React workspace, interaction model,
browser pipelines, and visual foundation.

Applications depend on this package; it imports no product code, and product-specific
schemas, routes, projections, and workflows stay with the application.

The public browser demo lives in the separate `setta-site` repository. Private package regression
fixtures start in [`fixtures/packed-consumer/src/main.tsx`](../fixtures/packed-consumer/src/main.tsx).
