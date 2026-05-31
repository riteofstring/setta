# Desktop Shell / Browser Pane Summary for Setta

This is a stack research note. The current source of truth for Setta 3 remains
`docs/plans/setta-3-architecture-rewrite.md`.

## Goal

Setta needs a desktop app with:

- A Go backend.
- A multi-pane UI.
- A third pane that behaves like a real browser viewport.
- Playwright/Codex-style automation for previewing, clicking, inspecting, screenshotting, and verifying generated UI.
- Ideally less complexity and less frontend copyability than a normal web app.

## Main conclusion

If the embedded browser pane is core to the product, **Electron is still the safest engineering choice**.

The best non-Electron option is **CEF**. However, CEF reduces some runtime overhead at the cost of substantially more app-shell complexity.

Wails, Tauri, and React Native are good app-shell options only if the browser pane is a simple preview surface. They are not ideal if the third pane needs reliable Playwright-style browser control.

## Wails

Wails is good for:

- Go backend + React/Svelte/Vue frontend.
- Lightweight desktop app shell.
- Native OS WebView rendering.
- Local generated previews through an iframe.

Wails is weak for:

- A true embedded Chromium browser pane.
- Playwright-controlled browser automation across platforms.
- Codex-style browser inspection and interaction.
- Multiple same-window browser views.

Wails uses system WebViews, not bundled Chromium. On Windows this may be WebView2; on macOS it is WebKit. That means behavior and automation support differ by platform.

### Verdict

Use Wails only if the third pane is a controlled iframe/local-preview pane.
Do **not** use Wails if the browser pane is a first-class agent/browser surface.

## React Native

React Native does not solve the browser-pane problem.

It can render a desktop UI, but its WebView is still platform-specific:

- Windows: WebView2 / Edge Chromium.
- macOS: WKWebView / WebKit.

That means it does not give a uniform Chromium browser target for Playwright.

### Verdict

Do not choose React Native for the Setta desktop shell unless mobile/tablet becomes a first-class product target.

## Electron

Electron gives the most direct path to:

- Embedded Chromium views, likely through Electron `WebContentsView`.
- Browser sessions/profiles.
- DevTools.
- A plausible automation loop through Playwright's Electron support, CDP
  attachment, or Electron's `webContents.debugger` API.
- Screenshots, console/network capture, DOM inspection.
- Codex-style browser workflow.
- Mature packaging/signing/updating ecosystem.

The downside is that Electron adds runtime weight and a Node/Electron app layer on top of the Go backend.

### Verdict

Electron is the best practical choice if the browser pane matters. The extra runtime overhead is probably cheaper than months of custom shell work.

The browser automation loop still needs an early proof. Before building major
features on top of it, verify screenshot capture, click/type interaction, DOM
inspection, console/network capture, focus, resize behavior, and cross-platform
packaging with the chosen Electron API.

## CEF

CEF is the best serious non-Electron option.

It gives:

- Embedded Chromium.
- Native browser views.
- Remote debugging / CDP access.
- Potential Playwright attachment via CDP.
- More control over the app shell.

But CEF is more like a browser engine than a full app framework. You must own more of the desktop infrastructure:

- Window/layout management.
- Browser lifecycle.
- Focus, resize, DPI, menus, modals.
- Packaging.
- Code signing.
- Updates.
- Crash recovery.
- Cross-platform issues.

CEF may have lower baseline overhead than Electron, but it still ships Chromium. It is not lightweight like Wails/Tauri.

### Verdict

CEF is viable if avoiding Electron is strategically important. But it comes with higher engineering risk.

## Energy

Energy is a Go-oriented CEF framework.

It is attractive because it may allow:

- Go-first desktop shell.
- CEF/Chromium underneath.
- React-style frontend UI.
- Compiled desktop app feel.

But it is a smaller ecosystem bet than Electron or Qt. The main risk is not whether it can open a window; the risk is whether it holds up for a production-quality, multi-pane, Playwright/CDP-controlled browser app.

### Verdict

Worth a short spike only. Do not commit without proving the full browser automation loop.

## Qt WebEngine

Qt WebEngine is mature and Chromium-based.

It can provide:

- Native desktop shell.
- Embedded Chromium view.
- Remote debugging / CDP-style access.

But it pulls the project into Qt/C++/QML complexity. That is probably a major detour for a Go + React product.

### Verdict

Technically viable, but probably not the right stack unless the team already wants Qt.

## Streamed Playwright viewport option

A possible MVP architecture:

```text
Wails/Tauri/React Native shell
├── pane 1: app controls
├── pane 2: editor/canvas
└── pane 3: streamed screenshot/canvas view

Go backend
├── launches Playwright Chromium
├── captures screenshots / screencast frames
├── forwards clicks and keyboard input
└── exposes DOM/console/network data
```

This avoids embedding a real browser widget.

Pros:

- Keeps Go backend central.
- Can work with Wails/Tauri/React Native.
- Good for agent verification.
- Avoids Electron as the shell.

Cons:

- Not a real browser viewport.
- Text selection, scrolling, focus, drag/drop, IME, context menus, and accessibility become custom work.
- Could feel janky if users interact with it heavily.

### Verdict

Good experimental/MVP path if the browser is mainly for agent verification. Poor choice if humans need a polished browser pane.

## Complexity vs performance: CEF vs Electron

### Electron

- Higher baseline runtime overhead.
- More batteries included.
- Better product velocity.
- Better-known Playwright path.
- Less custom shell engineering.

### CEF

- Potentially lower overhead.
- More native/compiled feel.
- More control.
- More custom infrastructure.
- More cross-platform risk.

Short version:

```text
Electron = more overhead, less product risk.
CEF      = less overhead potential, more engineering risk.
```

For a small team, Electron likely wins unless avoiding Electron is a hard product requirement.

## Protecting the frontend

You cannot truly compile/hide an Electron React frontend. It ships as HTML/CSS/JS.

The practical approach is to make the renderer unimportant:

```text
Electron renderer:
  thin UI only

Electron main/preload:
  minimal orchestration and typed bridge

Go backend:
  project state
  graph execution
  agent orchestration
  MCP/tools
  Playwright control
  licensing
  proprietary logic
```

Recommended protection measures:

- Keep real IP in Go/backend/server-side logic.
- Keep the renderer dumb.
- Disable production source maps.
- Use ASAR packaging.
- Enable ASAR integrity.
- Flip Electron fuses to disable dev-oriented escape hatches.
- Sign and notarize builds.
- Optionally compile sensitive Electron main/preload code to V8 bytecode.
- Do not rely on frontend obfuscation for real security.

The goal is not “nobody can inspect the frontend.”
The goal is “copying the frontend does not give them the product.”

## Recommended path

### Best practical architecture

```text
Electron app
├── pane 1: agent/chat/project controls
├── pane 2: editor/canvas/state UI
└── pane 3: WebContentsView-based Chromium browser preview

Go backend
├── project state
├── graph execution
├── agents/MCP/tools
├── Playwright/browser controller
├── local preview server
└── licensing/proprietary logic
```

### If avoiding Electron remains important

Run a short CEF/Energy spike:

```text
Energy or CEF app
├── React UI
├── embedded Chromium preview pane
├── local preview server
├── CDP remote debugging port
└── Playwright attaches, clicks, screenshots, reads DOM/console
```

The spike must prove:

- macOS and Windows support.
- Embedded browser pane.
- Playwright/CDP connection.
- Screenshot capture.
- Click/type interaction.
- DOM inspection.
- Console/network capture.
- Resize/focus correctness.
- Packaging feasibility.

If the spike is painful, use Electron.

## Final recommendation

For Setta, choose **Electron + Go backend** unless there is a hard reason to avoid Electron.

CEF/Energy is the best alternative, but only after a successful proof of concept.

Avoid Wails, Tauri, or React Native as the main shell if the embedded browser pane is core to the product.
