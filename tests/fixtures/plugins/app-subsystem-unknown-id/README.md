Acme app-subsystem fixture plugin.

Purpose:
- Prove the app-subsystem frontend contract works for a non-first-party plugin id.
- Exercise the same `apiVersion = 1` registration path the host uses for the
  first-party app subsystem plugin.

Behavior:
- Registers overview, preview, app-route, and app-deployment-modal renderers.
- Uses plain DOM mount/update/unmount handlers instead of React components.
- Exposes a small app-subsystem controller and chat registration for runtime
  metadata tests.
