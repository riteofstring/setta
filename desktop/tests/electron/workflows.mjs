export const electronWorkflows = [
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
    file: "native-artifact-routing-workflow.test.mjs",
    name: "native-artifact-routing",
    tiers: ["required"],
  },
  {
    file: "microphone-permissions-workflow.test.mjs",
    name: "microphone-permissions",
    tiers: ["required"],
  },
  {
    file: "hosted-cloud-chat-workflow.test.mjs",
    name: "hosted-cloud-chat",
    tiers: ["required"],
  },
  {
    file: "developer-hosted-runtime-workflow.test.mjs",
    name: "developer-hosted-runtime",
    tiers: ["required"],
  },
  {
    file: "live-codex-electron-workflow.test.mjs",
    name: "live-codex-electron",
    tiers: ["live-codex"],
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
