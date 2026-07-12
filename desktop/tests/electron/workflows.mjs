export const electronWorkflows = [
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
    file: "topic-conversation-pane-projection.test.mjs",
    name: "topic-conversation-pane-projection",
    tiers: ["required"],
  },
  {
    file: "topic-conversation-archive-workflow.test.mjs",
    name: "topic-conversation-archive",
    tiers: ["required"],
  },
  {
    file: "topic-conversation-role-configuration.test.mjs",
    name: "topic-conversation-role-configuration",
    tiers: ["required"],
  },
  {
    file: "topic-conversation-palette-identity.test.mjs",
    name: "topic-conversation-palette-identity",
    tiers: ["required"],
  },
  {
    file: "topic-conversation-crash-recovery.test.mjs",
    name: "topic-conversation-crash-recovery",
    tiers: ["required"],
  },
  {
    file: "microphone-permissions-workflow.test.mjs",
    name: "microphone-permissions",
    tiers: ["required"],
  },
  {
    file: "global-speech-session-workflow.test.mjs",
    name: "global-speech-session",
    tiers: ["required"],
  },
  {
    file: "topic-conversation-speech-arbitration.test.mjs",
    name: "topic-conversation-speech-arbitration",
    tiers: ["required"],
  },
  {
    file: "runtime-picker-workflow.test.mjs",
    name: "runtime-picker",
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
    file: "mobile-layout-workflow.test.mjs",
    name: "mobile-layout",
    tiers: ["required"],
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
    file: "niri-navigation-performance.test.mjs",
    name: "niri-navigation-performance",
    tiers: ["performance"],
  },
  {
    file: "topic-conversation-performance.test.mjs",
    name: "topic-conversation-performance",
    tiers: ["performance"],
  },
];

export function electronWorkflowNames() {
  return electronWorkflows.map((workflow) => workflow.name);
}
