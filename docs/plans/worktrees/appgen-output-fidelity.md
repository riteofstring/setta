# App Gen Output Fidelity

## Checklist Instructions

- Mark an item `[x]` only after implementation, relevant tests, and verification are complete.
- Keep the linked detailed plan doc updated with decisions/scope changes while working.
- If a task is split or re-scoped, update both this checklist line and the linked plan path.

## Todo Checklist

- [x] **Reference-Image Guided JSON Render Fidelity**: app gen can optionally use a source style image of the intended UI design, and generated output should match that source image as closely as possible. Plan: `docs/plans/worktrees/appgen-output-fidelity/01-reference-image-guided-ui-alignment.md`
- [x] **Zero-Prompt JSON Render Baseline Quality**: app gen should look materially better with plain JSON render and no user prompt input. Plan: `docs/plans/worktrees/appgen-output-fidelity/02-improve-empty-input-json-render-fidelity.md`
- [x] **Unified App-Generation Mode Switcher and Routing**: support mode switching across JSON render, JSON+image guidance, prompt-builder handoff, and MCP-server generation via chat AI. Plan: `docs/plans/worktrees/appgen-output-fidelity/03-appgen-mode-transition-flows.md`
- [x] **Chat-First Control of All App-Generation Modes**: all app gen flows should be triggerable and controllable from chat AI, without requiring pane-switching to execute. Plan: `docs/plans/worktrees/appgen-output-fidelity/04-chat-pane-controls-every-appgen-mode.md`
- [x] **MCP/Figma Roundtrip Design Sync**: MCP mode supports pulling existing Figma designs into Setta, or prompting generation in Figma first and pulling results back into Setta. Plan: `docs/plans/worktrees/appgen-output-fidelity/05-figma-mcp-design-sync-loop.md`
- [x] **Project Chat Skills Directory Browser and MCP Viewer**: reimplemented skills/MCP browsing with a corrected architecture that does not depend on the prior JSON-render assumption. Plan: `docs/plans/worktrees/appgen-output-fidelity/06-rebuild-skills-mcp-browser-ui.md`
