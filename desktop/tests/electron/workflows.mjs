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
    file: "dom-pane-snapshot-scroll-workflow.test.mjs",
    name: "dom-pane-snapshot-scroll",
    tiers: ["required"],
  },
  {
    file: "mobile-layout-workflow.test.mjs",
    name: "mobile-layout",
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
    args: ["--scenario", "editable-draft-durability"],
    file: "workflow-graph-durable-drag-contract.test.mjs",
    name: "workflow-graph-editable-drag-contract",
    tiers: ["refactor"],
  },
  {
    args: ["--scenario", "read-only-run-ports"],
    file: "workflow-graph-durable-drag-contract.test.mjs",
    name: "workflow-graph-read-only-port-contract",
    tiers: ["refactor"],
  },
  {
    args: ["--scenario", "read-only-run-view-layout"],
    file: "workflow-graph-durable-drag-contract.test.mjs",
    name: "workflow-graph-read-only-view-layout-contract",
    tiers: ["refactor"],
  },
  {
    args: ["--scenario", "active-replacement-during-drag"],
    file: "workflow-graph-durable-drag-contract.test.mjs",
    name: "workflow-graph-active-replacement-contract",
    tiers: ["refactor"],
  },
  {
    args: ["--scenario", "node-drag-pointercancel"],
    file: "workflow-graph-durable-drag-contract.test.mjs",
    name: "workflow-graph-node-drag-pointercancel-contract",
    tiers: ["refactor"],
  },
  {
    args: ["--scenario", "edge-draw-pointercancel"],
    file: "workflow-graph-durable-drag-contract.test.mjs",
    name: "workflow-graph-edge-draw-pointercancel-contract",
    tiers: ["refactor"],
  },
  {
    args: ["--scenario", "marquee-pointercancel"],
    file: "workflow-graph-durable-drag-contract.test.mjs",
    name: "workflow-graph-marquee-pointercancel-contract",
    tiers: ["refactor"],
  },
  {
    args: ["--scenario", "live-runtime-drag"],
    file: "workflow-graph-durable-drag-contract.test.mjs",
    name: "workflow-graph-live-runtime-drag-contract",
    tiers: ["refactor"],
  },
  {
    file: "semantic-graph-workflow.test.mjs",
    name: "semantic-graph",
    tiers: ["required"],
  },
  {
    file: "semantic-cartographer-auto-workflow.test.mjs",
    name: "semantic-cartographer-auto",
    tiers: ["required"],
  },
  {
    file: "workspace-trajectory-file-fidelity.test.mjs",
    name: "workspace-trajectory-file-fidelity",
    tiers: ["required"],
  },
  {
    file: "visual-parity-workflow.test.mjs",
    name: "visual-parity",
    tiers: ["performance"],
  },
  {
    file: "workflow-graph-scale-validation.test.mjs",
    name: "workflow-graph-scale-validation",
    tiers: ["performance"],
  },
  {
    args: ["--scenario", "phase3"],
    file: "workflow-graph-pan-zoom-recording.test.mjs",
    name: "workflow-graph-pan-zoom-phase3",
    tiers: ["performance"],
  },
  {
    args: ["--scenario", "baseline"],
    file: "workflow-graph-pan-zoom-recording.test.mjs",
    name: "workflow-graph-pan-zoom-baseline",
    tiers: ["performance"],
  },
  {
    args: ["--scenario", "small-trackpad"],
    file: "workflow-graph-pan-zoom-recording.test.mjs",
    name: "workflow-graph-pan-zoom-small-trackpad",
    tiers: ["performance"],
  },
  {
    args: ["--scenario", "small-active"],
    file: "workflow-graph-pan-zoom-recording.test.mjs",
    name: "workflow-graph-pan-zoom-small-active",
    tiers: ["performance"],
  },
  {
    args: ["--scenario", "active"],
    file: "workflow-graph-pan-zoom-recording.test.mjs",
    name: "workflow-graph-pan-zoom-active",
    tiers: ["performance"],
  },
  {
    args: ["--scenario", "large"],
    file: "workflow-graph-pan-zoom-recording.test.mjs",
    name: "workflow-graph-pan-zoom-large",
    tiers: ["performance"],
  },
  {
    args: ["--semantic-live-recording-only"],
    file: "semantic-cartographer-auto-workflow.test.mjs",
    name: "semantic-live-run",
    tiers: ["performance"],
  },
  {
    args: ["--workflow", "workflow-graph-pan-zoom-runtime-burst"],
    file: "semantic-runtime-phase7-acceptance.test.mjs",
    name: "workflow-graph-pan-zoom-runtime-burst",
    tiers: ["performance"],
  },
  {
    args: ["--workflow", "semantic-review-live-product"],
    file: "semantic-runtime-phase7-acceptance.test.mjs",
    name: "semantic-review-live-product",
    tiers: ["performance"],
  },
  {
    args: ["--workflow", "semantic-runtime-reconnect"],
    file: "semantic-runtime-phase7-acceptance.test.mjs",
    name: "semantic-runtime-reconnect",
    tiers: ["performance"],
  },
  {
    args: ["--workflow", "semantic-runtime-large-review"],
    file: "semantic-runtime-phase7-acceptance.test.mjs",
    name: "semantic-runtime-large-review",
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
