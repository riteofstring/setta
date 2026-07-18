import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import type { ActiveRunPresentation } from "../lib/chat-run-liveness";
import { Composer } from "./chat-composer";

const steerableRunPresentation = {
  canRetry: false,
  canSteer: true,
  canStop: false,
  kind: "working",
  liveness: null,
  running: true,
} satisfies ActiveRunPresentation;

describe("composer boundary", () => {
  test("renders a steering-only session without selected-chat send actions", () => {
    const html = renderToString(
      <Composer
        actions={{ steerMessage: async () => null }}
        busy={false}
        running
        runPresentation={steerableRunPresentation}
        viewModel={{
          activeRunId: "run_workflow_node",
          commandListError: null,
          commandListStatus: "idle",
          goal: null,
          operation: null,
          pendingSteeringMessageIds: [],
          session: {
            commandListContextKey: "",
            id: "workflow_node_execution_alpha:run_workflow_node",
            modelLabel: "Model",
            permissionLabel: "Workspace Access",
            reasoningLabel: "Reasoning",
            supportsImages: false,
            workspaceId: "workspace_api",
          },
          status: "ready",
        }}
      />,
    );

    expect(html).toContain("Send steering message");
    expect(html).not.toContain("Queue follow-up");
    expect(html).not.toContain("Open model and reasoning picker");
    expect(html).not.toContain("Open permission mode picker");
  });
});
