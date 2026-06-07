import { describe, expect, test } from "vitest";

import { workflowGraphWithUpdatedAgentTask } from "./workflow-node-details-surface";

describe("workflow node details surface helpers", () => {
  test("updates Agent Task Codex configuration without changing other nodes", () => {
    const graph = workflowGraphWithUpdatedAgentTask(
      {
        edges: [],
        layout: { nodes: [] },
        nodes: [
          {
            action: {
              codex: {
                freshConversation: true,
                model: "",
                prompt: "old prompt",
                reasoningEffort: "",
              },
              kind: "agent.codex",
            },
            gateway: null,
            id: "agent_task",
            kind: "action",
            loopGuard: null,
            title: "Agent Task",
          },
          {
            action: null,
            gateway: null,
            id: "end",
            kind: "end",
            loopGuard: null,
            title: "End",
          },
        ],
      },
      "agent_task",
      {
        freshConversation: false,
        model: "gpt-5",
        prompt: "review the workspace",
        reasoningEffort: "medium",
        title: "Review Workspace",
      },
    );

    expect(graph.nodes[0]).toMatchObject({
      action: {
        codex: {
          freshConversation: false,
          model: "gpt-5",
          prompt: "review the workspace",
          reasoningEffort: "medium",
        },
      },
      title: "Review Workspace",
    });
    expect(graph.nodes[1]).toMatchObject({ id: "end", title: "End" });
  });
});
