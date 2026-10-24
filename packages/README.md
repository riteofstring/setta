# Shared packages

Setta publishes two packages:

- [`workspace`](workspace/) is the React workspace, interaction model, browser pipelines, and visual
  foundation.
- [`local-backend`](local-backend/) provides application-neutral Go infrastructure for local HTTP
  servers, files, revisioned state, live updates, and process boundaries.

Applications depend on these packages; the packages import no product code, and product-specific
schemas, routes, projections, and workflows stay with the application.

The public browser demo lives in the separate `setta-site` repository. Private package regression
fixtures live in [`fixtures/packed-consumer`](../fixtures/packed-consumer/); `local-backend` is
exercised through package tests.
