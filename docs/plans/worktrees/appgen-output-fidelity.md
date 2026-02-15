# App Gen Output Fidelity

## Checklist Instructions

- Mark an item `[x]` only after implementation, relevant tests, and verification are complete.
- Keep the linked detailed plan doc updated with decisions/scope changes while working.
- If a task is split or re-scoped, update both this checklist line and the linked plan path.

## Todo Checklist

- [ ] app gen should be able to optionally use a source style image of the intended UI design, and the generated output should match that source image as closely as possible. Plan: `docs/plans/worktrees/appgen-output-fidelity/01-reference-image-guided-ui-alignment.md`
- [ ] app gen needs to look better with just json render and no user input (improve json render catalog? add option for shadcn defaulting to setta's visual style? -- for shadcn, perhaps only install components as needed on the fly?). Plan: `docs/plans/worktrees/appgen-output-fidelity/02-improve-empty-input-json-render-fidelity.md`
- [ ] app gen should support mode switching: json render, json render with source image guidance, prompt building (generate button clicked --> send to chat behind the scenes without changing panes), and mcp server-driven generation via chat ai pane. Plan: `docs/plans/worktrees/appgen-output-fidelity/03-appgen-mode-transition-flows.md`
- [ ] all app gen should be possible from chat ai pane. despite the app gen pane existing, we should be able to just control it from chat and have it "just work". for example, a prompt might read 'could you please use json render to generate a standalone app for me?". Plan: `docs/plans/worktrees/appgen-output-fidelity/04-chat-pane-controls-every-appgen-mode.md`
- [ ] mcp server mode should support figma flows: pull an existing figma design into setta, or prompt in setta to generate a figma design first and then pull that figma result back into setta. Plan: `docs/plans/worktrees/appgen-output-fidelity/05-figma-mcp-design-sync-loop.md`
- [ ] reimplement the skills/mcp browser UI from the previously reverted branch, but with a corrected implementation approach that does not rely on the prior json-render assumption. Plan: `docs/plans/worktrees/appgen-output-fidelity/06-rebuild-skills-mcp-browser-ui.md`
