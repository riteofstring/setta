# Shared packages

Setta's four applications build on three shared packages:

- [`workspace`](workspace/) is the React workspace, interaction model, and visual foundation used
  by every app.
- [`local-backend`](local-backend/) provides application-neutral Go infrastructure for local HTTP
  servers, sessions, files, and process boundaries.
- [`setta-runtime`](setta-runtime/) provides the Python command line, application registry, local
  server supervision, and platform-wheel assembly.

Dependencies flow from applications into these packages. Shared packages do not import product
code, and product-specific schemas, routes, projections, and workflows stay with their app.

The browser-only Workspace example lives in
[`examples/workspace-playground`](../examples/workspace-playground/). `local-backend` has no visual
playground; its behavior is exercised through package tests and the four applications that use it.
