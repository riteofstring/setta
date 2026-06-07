export const electronWorkflows = [
  {
    args: ["--deterministic-only"],
    file: "chat-workflows.test.mjs",
    name: "chat",
    tiers: ["required"],
  },
  {
    file: "chat-last-selected-workflow.test.mjs",
    name: "chat-last-selected",
    tiers: ["required"],
  },
  {
    file: "corrupt-chat-workflow.test.mjs",
    name: "corrupt-chat",
    tiers: ["required"],
  },
  {
    file: "app-window-drag-workflow.test.mjs",
    name: "app-window-drag",
    tiers: ["required"],
  },
  {
    file: "settings-pane-workflow.test.mjs",
    name: "settings-pane",
    tiers: ["required"],
  },
  {
    file: "terminal-workflow.test.mjs",
    name: "terminal",
    tiers: ["required"],
  },
  {
    file: "terminal-profile-workflow.test.mjs",
    name: "terminal-profile",
    tiers: ["required"],
  },
  {
    file: "terminal-backend-crash-workflow.test.mjs",
    name: "terminal-backend-crash",
    tiers: ["required"],
  },
  {
    file: "pane-focus-click-workflow.test.mjs",
    name: "pane-focus-click",
    tiers: ["required"],
  },
  {
    file: "pane-resize-handles-workflow.test.mjs",
    name: "pane-resize-handles",
    tiers: ["required"],
  },
  {
    file: "workflow-graph-smoke.test.mjs",
    name: "workflow-graph-smoke",
    tiers: ["required"],
  },
  {
    file: "workflow-blank-canvas.test.mjs",
    name: "workflow-blank-canvas",
    tiers: ["required"],
  },
  {
    file: "workflow-graph-scale-validation.test.mjs",
    name: "workflow-graph-scale-validation",
    tiers: ["performance"],
  },
  {
    file: "overview-zoom-performance.test.mjs",
    name: "overview-zoom-performance",
    tiers: ["performance"],
  },
  {
    args: ["--live-only"],
    file: "chat-workflows.test.mjs",
    name: "live-codex-electron",
    tiers: ["live"],
  },
];

export function electronWorkflowNames() {
  return electronWorkflows.map((workflow) => workflow.name);
}
