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
    file: "prod-record-chat-workflow.test.mjs",
    name: "prod-record-chat",
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
    file: "easy-button-pane-workflow.test.mjs",
    name: "easy-button-pane",
    tiers: ["required"],
  },
  {
    file: "topic-conversation-pane-projection.test.mjs",
    name: "topic-conversation-pane-projection",
    tiers: ["required"],
  },
  {
    file: "speech-api-workflow.test.mjs",
    name: "speech-api",
    tiers: ["required"],
  },
  {
    file: "microphone-permissions-workflow.test.mjs",
    name: "microphone-permissions",
    tiers: ["required"],
  },
  {
    file: "speech-capture-workflow.test.mjs",
    name: "speech-capture",
    tiers: ["required"],
  },
  {
    file: "speech-pwa-secure-context-workflow.test.mjs",
    name: "speech-pwa-secure-context",
    tiers: ["required"],
  },
  {
    file: "runtime-picker-workflow.test.mjs",
    name: "runtime-picker",
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
    file: "workspace-ultrawide-live-panes.test.mjs",
    name: "workspace-ultrawide-live-panes",
    tiers: ["required"],
  },
  {
    file: "pane-drag-drop-workflow.test.mjs",
    name: "pane-drag-drop",
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
    file: "workflow-activity-feed.test.mjs",
    name: "workflow-activity-feed",
    tiers: ["required"],
  },
  {
    file: "workflow-run-navigation.test.mjs",
    name: "workflow-run-navigation",
    tiers: ["required"],
  },
  {
    file: "workflow-graph-interaction-cancellation.test.mjs",
    name: "workflow-graph-interaction-cancellation",
    tiers: ["required"],
  },
  {
    file: "workflow-blank-canvas.test.mjs",
    name: "workflow-blank-canvas",
    tiers: ["required"],
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
    file: "workflow-graph-scale-validation.test.mjs",
    name: "workflow-graph-scale-validation",
    tiers: ["performance"],
  },
  {
    file: "workflow-graph-maximized-4k-overview.test.mjs",
    name: "workflow-graph-maximized-4k-overview",
    tiers: ["performance"],
  },
  {
    file: "workflow-graph-maximized-idle-4k.test.mjs",
    name: "workflow-graph-maximized-idle-4k",
    tiers: ["performance"],
  },
  {
    file: "terminal-maximized-4k-overview.test.mjs",
    name: "terminal-maximized-4k-overview",
    tiers: ["performance"],
  },
  {
    file: "overview-zoom-performance.test.mjs",
    name: "overview-zoom-performance",
    tiers: ["performance"],
  },
  {
    file: "pane-drag-drop-benchmark-performance.test.mjs",
    name: "pane-drag-drop-benchmark-performance",
    tiers: ["performance"],
  },
  {
    file: "easy-button-pane-performance.test.mjs",
    name: "easy-button-pane-performance",
    tiers: ["performance"],
  },
  {
    file: "niri-navigation-performance.test.mjs",
    name: "niri-navigation-performance",
    tiers: ["performance"],
  },
  {
    file: "chat-stream-performance.test.mjs",
    name: "chat-stream-performance",
    tiers: ["performance"],
  },
  {
    file: "chat-long-transcript-performance.test.mjs",
    name: "chat-long-transcript-performance",
    tiers: ["performance"],
  },
  {
    args: ["--live-only"],
    file: "chat-workflows.test.mjs",
    name: "live-codex-electron",
    tiers: ["live"],
  },
  {
    file: "easy-button-live-workflow.test.mjs",
    name: "easy-button-live",
    tiers: ["live"],
  },
  {
    file: "live-openai-speech-workflow.test.mjs",
    name: "live-openai-speech",
    tiers: ["live-openai"],
  },
];

export function electronWorkflowNames() {
  return electronWorkflows.map((workflow) => workflow.name);
}
