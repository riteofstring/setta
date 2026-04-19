Acme app-subsystem fixture plugin.

Purpose:
- Prove the app-subsystem backend and frontend contracts work for a
  non-first-party plugin id.
- Exercise the same runtime backend listener-endpoint contract the host uses
  for the first-party app subsystem plugin.

Behavior:
- Registers overview, preview, app-route, and app-deployment-modal renderers.
- Uses plain DOM mount/update/unmount handlers instead of React components.
- Exposes a small app-subsystem controller and chat registration for runtime
  metadata tests.
- Delegates app-definition reads, validation, mutations, and compare-and-set
  metadata writes through the generic local-core-backed backend contract.
