export const electronWorkflows = [
  {
    file: "app-pane-layout-workflow.test.mjs",
    name: "app-pane-layout",
    tiers: ["legacy-pane"],
  },
  {
    file: "app-window-drag-workflow.test.mjs",
    name: "app-window-drag",
    tiers: ["legacy-pane"],
  },
  {
    file: "settings-page-workflow.test.mjs",
    name: "settings-page",
    tiers: ["legacy-pane"],
  },
  {
    file: "topic-conversation-pane-projection.test.mjs",
    name: "topic-conversation-pane-projection",
    tiers: ["legacy-pane"],
  },
  {
    file: "topic-conversation-creation-workflow.test.mjs",
    name: "topic-conversation-creation",
    tiers: ["legacy-pane"],
  },
  {
    file: "topic-conversation-provider-thread-lifecycle.test.mjs",
    name: "topic-conversation-provider-thread-lifecycle",
    tiers: ["legacy-pane"],
  },
  {
    file: "topic-conversation-artifact-unresolved.test.mjs",
    name: "topic-conversation-artifact-unresolved",
    tiers: ["legacy-pane"],
  },
  {
    file: "workspace-first-run-recovery.test.mjs",
    name: "workspace-first-run-recovery",
    tiers: ["legacy-pane"],
  },
  {
    file: "topic-conversation-archive-workflow.test.mjs",
    name: "topic-conversation-archive",
    tiers: ["legacy-pane"],
  },
  {
    file: "topic-conversation-role-configuration.test.mjs",
    name: "topic-conversation-role-configuration",
    tiers: ["legacy-pane"],
  },
  {
    file: "topic-conversation-presentation-configuration.test.mjs",
    name: "topic-conversation-presentation-configuration",
    tiers: ["legacy-pane"],
  },
  {
    file: "topic-conversation-palette-identity.test.mjs",
    name: "topic-conversation-palette-identity",
    tiers: ["legacy-pane"],
  },
  {
    file: "topic-conversation-crash-recovery.test.mjs",
    name: "topic-conversation-crash-recovery",
    tiers: ["legacy-pane"],
  },
  {
    file: "director-command-center-workflow.test.mjs",
    name: "director-command-center",
    tiers: ["required"],
  },
  {
    file: "director-command-center-local-voice-workflow.test.mjs",
    name: "director-command-center-local-voice",
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
    tiers: ["legacy-pane"],
  },
  {
    file: "local-macos-voice-capture-workflow.test.mjs",
    name: "local-macos-voice-capture",
    tiers: ["legacy-pane"],
  },
  {
    file: "folderless-conversation-local-voice-workflow.test.mjs",
    name: "folderless-conversation-local-voice",
    tiers: ["legacy-pane"],
  },
  {
    file: "topic-conversation-speech-arbitration.test.mjs",
    name: "topic-conversation-speech-arbitration",
    tiers: ["legacy-pane"],
  },
  {
    file: "master-folderless-routing-workflow.test.mjs",
    name: "master-folderless-routing",
    tiers: ["legacy-pane"],
  },
  {
    file: "instant-voice-capture-phase0-audioworklet.test.mjs",
    name: "instant-voice-capture-phase0-audioworklet",
    tiers: ["performance"],
  },
  {
    file: "instant-voice-capture-phase0-live-openai.test.mjs",
    name: "instant-voice-capture-phase0-live-openai",
    tiers: ["live"],
  },
  {
    file: "instant-voice-capture-phase4-workflow.test.mjs",
    name: "instant-voice-capture-phase4-workflow",
    tiers: ["performance"],
  },
  {
    file: "easy-button-presentation-recovery-phase0.test.mjs",
    name: "easy-button-presentation-recovery-phase0",
    tiers: ["recovery"],
  },
  {
    file: "runtime-picker-workflow.test.mjs",
    name: "runtime-picker",
    tiers: ["legacy-pane"],
  },
  {
    file: "pane-focus-click-workflow.test.mjs",
    name: "pane-focus-click",
    tiers: ["legacy-pane"],
  },
  {
    file: "pane-resize-handles-workflow.test.mjs",
    name: "pane-resize-handles",
    tiers: ["legacy-pane"],
  },
  {
    file: "workspace-ultrawide-live-panes.test.mjs",
    name: "workspace-ultrawide-live-panes",
    tiers: ["legacy-pane"],
  },
  {
    file: "pane-drag-drop-workflow.test.mjs",
    name: "pane-drag-drop",
    tiers: ["legacy-pane"],
  },
  {
    file: "mobile-layout-workflow.test.mjs",
    name: "mobile-layout",
    tiers: ["legacy-pane"],
  },
  {
    file: "overview-zoom-performance.test.mjs",
    name: "overview-zoom-performance",
    tiers: ["legacy-pane-performance"],
  },
  {
    file: "pane-drag-drop-benchmark-performance.test.mjs",
    name: "pane-drag-drop-benchmark-performance",
    tiers: ["legacy-pane-performance"],
  },
  {
    file: "niri-navigation-performance.test.mjs",
    name: "niri-navigation-performance",
    tiers: ["legacy-pane-performance"],
  },
  {
    file: "topic-conversation-performance.test.mjs",
    name: "topic-conversation-performance",
    tiers: ["legacy-pane-performance"],
  },
  {
    file: "director-graph-renderer-performance.test.mjs",
    name: "director-graph-renderer-performance",
    tiers: ["performance"],
  },
  {
    file: "director-command-center-performance.test.mjs",
    name: "director-command-center-performance",
    tiers: ["performance"],
  },
];

export function electronWorkflowNames() {
  return electronWorkflows.map((workflow) => workflow.name);
}
