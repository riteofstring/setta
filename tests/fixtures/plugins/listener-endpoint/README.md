# listener-endpoint

Hybrid fixture plugin for the frontend listener-endpoint websocket caller.

- Purpose: prove a live plugin pane can invoke a backend listener endpoint over
  `/ws/listeners/{listenerID}`.
- Capabilities: `registerPane`, `registerRouter`,
  `registerListenerEndpoint`.

Manual smoke:

```bash
scripts/plugin-fixtures/link.sh listener-endpoint
```
