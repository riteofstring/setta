# Resize Jank Report

## 2026-06-01T16:31:29Z

Scope: Electron shell resize behavior in the renderer and native window.

Baseline before fix:
- BrowserWindow had no explicit `backgroundColor`, so native resize could expose Electron's default white compositor background before the renderer repainted.
- Shell resize path had 8 layout-affecting transitions across `App.tsx`, `resizable-pane.tsx`, and `workspace-pane.tsx`.
- App root used viewport height sizing (`h-screen`) instead of a fixed inset root.

After fix:
- BrowserWindow has `backgroundColor: "#18181b"`.
- `html`, `body`, and `#root` all paint the same dark background.
- App root uses `fixed inset-0`.
- Shell resize path has 0 layout-affecting transitions across `App.tsx`, `resizable-pane.tsx`, and `workspace-pane.tsx`.

Verification:
- `rg` shell layout transition count: 8 before, 0 after.
