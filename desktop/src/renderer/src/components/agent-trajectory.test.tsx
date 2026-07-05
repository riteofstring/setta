import { renderToString } from "react-dom/server";
import { describe, expect, test } from "vitest";

import { queuedChatMessage } from "../App.test.fixtures";
import { testRun } from "../stores/chat-store.test.fixtures";
import { activityBlock, userMessageBlock } from "../stores/chat-store-events.test.helpers";
import {
  activeRunPresentationForAgentTrajectory,
  AgentTrajectorySurface,
  type AgentTrajectoryCapabilities,
  type AgentTrajectoryViewModel,
} from "./agent-trajectory";

describe("agent trajectory surface", () => {
  test("requires actions for enabled capabilities", () => {
    expect(() =>
      renderToString(
        <AgentTrajectorySurface
          actions={{}}
          viewModel={trajectoryViewModel({
            capabilities: {
              ...disabledCapabilities,
              sendSteering: true,
            },
          })}
        />,
      ),
    ).toThrow("Agent trajectory action sendSteering is required by its capability.");
  });

  test("renders disabled trajectory actions without selected-chat affordances", () => {
    const html = renderToString(
      <AgentTrajectorySurface
        actions={{}}
        viewModel={trajectoryViewModel({
          activeRun: testRun("running"),
          blocks: [
            userMessageBlock({
              delivery: "steering",
              id: "block_steering",
              messageStatus: "pending",
              ordinal: 1,
              runId: "run_api",
              text: "pending steer",
            }),
            activityBlock({
              hasDetails: true,
              hasOutput: true,
              id: "block_output",
              ordinal: 2,
              runId: "run_api",
              sourceRunItemId: "item_output",
            }),
          ],
          focusedSourceRunItemId: "item_output",
          queuedMessages: [queuedChatMessage("message_queued", "run_queue", "queued work")],
          runItemOutputPagesByRunItemId: {
            item_output: {
              error: null,
              hasMore: true,
              loadedThroughOrdinal: 3,
              loading: false,
              nextOrdinal: 4,
            },
          },
        })}
      />,
    );

    expect(html).toContain("Queued");
    expect(html).not.toContain('aria-label="Edit queued message"');
    expect(html).not.toContain('aria-label="Confirm queued message removal"');
    expect(html).toContain("Steering");
    expect(html).not.toContain('aria-label="Interrupt and send pending steering"');
    expect(html).toContain("More output is available.");
    expect(html).not.toContain("Load more");
  });

  test("derives active-run controls from trajectory capabilities", () => {
    const viewModel = trajectoryViewModel({
      activeRun: testRun("running"),
      activeRunLiveness: {
        cancellable: true,
        conversationId: "conversation_api",
        error: "",
        harness: "codex",
        lastProviderEventAt: "2026-05-29T20:00:00Z",
        lastReconciledAt: "",
        providerThreadId: "thread_api",
        providerTurnId: "turn_api",
        reason: "provider_unavailable",
        retryable: true,
        runId: "run_api",
        status: "lost",
        workspaceId: "workspace_api",
      },
    });

    expect(activeRunPresentationForAgentTrajectory(viewModel)).toMatchObject({
      canRetry: false,
      canSteer: false,
      canStop: false,
      kind: "lost",
      running: true,
    });
  });
});

const disabledCapabilities = {
  loadOlderHistory: false,
  loadRunItemOutput: false,
  queuedMessageActions: false,
  retryLiveness: false,
  sendSteering: false,
  stopRun: false,
  submitApproval: false,
} satisfies AgentTrajectoryCapabilities;

function trajectoryViewModel(
  overrides: Partial<AgentTrajectoryViewModel> = {},
): AgentTrajectoryViewModel {
  return {
    activeRun: null,
    activeRunLiveness: null,
    blocks: [],
    capabilities: disabledCapabilities,
    editingQueuedMessageId: null,
    hasMoreOlder: false,
    messages: [],
    operation: null,
    queuedMessages: [],
    removingQueuedMessageId: null,
    runItemOutputIdsByRunItemId: {},
    runItemOutputPagesByRunItemId: {},
    runItemOutputsById: {},
    scope: {
      conversationId: "conversation_api",
      kind: "chatConversation",
      workspaceId: "workspace_api",
    },
    ...overrides,
  };
}
