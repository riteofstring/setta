# Pixi Workspace Visual Tooling

Use this workflow when developing or reviewing the Pixi workspace prototype.

Run the hidden visual smoke workflow:

```sh
./scripts/test_pixi_workspace_visual.sh
```

Run with the Electron window visible:

```sh
./scripts/test_pixi_workspace_visual.sh --visible --keep-artifacts
```

Artifacts are written under:

```text
.recordings/pixi-workspace/
```

The latest run is available at:

```text
.recordings/pixi-workspace/latest
```

The smoke workflow launches Electron with temporary app data and:

```text
SETTA_PIXI_WORKSPACE_PROTOTYPE=1
SETTA_PIXI_WORKSPACE_DEBUG=1
```

It captures screenshots, verifies the canvas is nonblank through the Pixi debug
snapshot API, drives pan and zoom gestures, drags a hard-coded node, and writes
`summary.json`.

To attach Chrome DevTools MCP to the latest visual run while it is still open:

```sh
./scripts/electron-devtools-mcp.sh
```

If the debug port is not from the latest Pixi visual run, provide it directly:

```sh
SETTA_ELECTRON_CDP_PORT=9229 ./scripts/electron-devtools-mcp.sh
```

