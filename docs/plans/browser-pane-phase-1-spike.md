# Browser Pane Phase 1 Spike

## Chosen Path

Phase 1 uses Electron `WebContentsView` owned by Electron main. The renderer only
reports the reserved pane bounds through preload IPC. Browser automation actions
also go through typed preload IPC for the spike, with direct Electron APIs kept
inside main.

The repeatable proof is:

```sh
pnpm -C desktop smoke:browser
```

The smoke launches the built Electron app with Playwright Electron support and
exercises the production `WebContentsView` path.

## Proof Points

- Local preview URL: `desktop/static/browser-preview.html` is loaded as a local
  `file://` URL.
- Screenshot capture: main calls `webContents.capturePage()`.
- DOM inspection: main calls `webContents.executeJavaScript()` through the
  typed browser-pane IPC path.
- Console capture: main records `console-message` events from the preview.
- Click/type interaction: main uses `sendInputEvent()` and `insertText()`.
- Resize and focus: the renderer reports bounds through a `ResizeObserver`, and
  main focuses the `WebContentsView`.
- Network capture: main records `webRequest.onCompleted` events for local file
  and loopback HTTP URLs. If future generated-UI verification needs HAR-grade
  details, the next investigation step is CDP/debugger network event capture.

## Future Go Boundary

Go should not call Electron internals directly. Future Go-owned orchestration
should request browser actions through an explicit local protocol handled by
Electron main, reusing the same narrow command/result shapes proven by this
spike.
