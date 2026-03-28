import { createAgentRun, createMessageTextContent } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  getManagedChatRunRefreshKey,
  shouldExitManagedChatHistory,
  shouldPersistInitializedChatState,
} from "./ChatArea";

describe("shouldExitManagedChatHistory", () => {
  it("closes history when the managed chat binding changes", () => {
    expect(
      shouldExitManagedChatHistory({
        previousChatId: "chat-before",
        nextChatId: "chat-after",
        previousWaitingForResponse: false,
        nextWaitingForResponse: false,
      }),
    ).toBe(true);
  });

  it("closes history when the current managed chat starts a new response", () => {
    expect(
      shouldExitManagedChatHistory({
        previousChatId: "chat-current",
        nextChatId: "chat-current",
        previousWaitingForResponse: false,
        nextWaitingForResponse: true,
      }),
    ).toBe(true);
  });

  it("keeps history open when there is no new external chat activity", () => {
    expect(
      shouldExitManagedChatHistory({
        previousChatId: "chat-current",
        nextChatId: "chat-current",
        previousWaitingForResponse: true,
        nextWaitingForResponse: true,
      }),
    ).toBe(false);
  });
});

describe("getManagedChatRunRefreshKey", () => {
  it("returns the newest matching run for the section, chat, and run type", () => {
    const refreshKey = getManagedChatRunRefreshKey({
      agentRuns: [
        createAgentRun({
          id: "other-section",
          status: "running",
          startedAt: "2026-03-13T16:00:00Z",
          inputs: {
            runType: "external_agent",
            sectionId: "section-other",
            chatId: "chat-current",
          },
        }),
        createAgentRun({
          id: "current-running",
          status: "running",
          startedAt: "2026-03-13T16:10:00Z",
          inputs: {
            runType: "external_agent",
            sectionId: "section-current",
            chatId: "chat-current",
          },
        }),
        createAgentRun({
          id: "current-completed",
          status: "completed",
          startedAt: "2026-03-13T16:20:00Z",
          finishedAt: "2026-03-13T16:21:00Z",
          inputs: {
            runType: "external_agent",
            sectionId: "section-current",
            chatId: "chat-current",
          },
        }),
      ],
      sectionId: "section-current",
      chatId: "chat-current",
      runType: "external_agent",
    });

    expect(refreshKey).toBe(
      `current-completed:completed:${Date.parse("2026-03-13T16:21:00Z")}`,
    );
  });

  it("returns null when there is no matching current-thread run", () => {
    expect(
      getManagedChatRunRefreshKey({
        agentRuns: [
          createAgentRun({
            id: "llm-run",
            status: "running",
            startedAt: "2026-03-13T16:10:00Z",
            inputs: {
              runType: "llm_chat",
              sectionId: "section-current",
              chatId: "chat-current",
            },
          }),
        ],
        sectionId: "section-current",
        chatId: "chat-current",
        runType: "external_agent",
      }),
    ).toBeNull();
  });
});

describe("shouldPersistInitializedChatState", () => {
  it("persists auto-initialized branch state while the source state is still branchless", () => {
    expect(
      shouldPersistInitializedChatState({
        currentState: {
          messages: [
            {
              id: "message-1",
              role: "user",
              content: [createMessageTextContent({ text: "hello" })],
              attachments: [],
            },
          ],
          inputText: "Draft input",
          waitingForResponse: true,
          toolCallArguments: { "tool-call-1": '{"query":"hello"}' },
          activeBranchId: null,
          branches: {},
        },
        initializedState: {
          messages: [
            {
              id: "message-1",
              role: "user",
              content: [createMessageTextContent({ text: "hello" })],
              attachments: [],
            },
          ],
          inputText: "Draft input",
          waitingForResponse: true,
          toolCallArguments: { "tool-call-1": '{"query":"hello"}' },
          activeBranchId: "branch-1",
          branches: {
            "branch-1": {
              messages: [
                {
                  id: "message-1",
                  role: "user",
                  content: [createMessageTextContent({ text: "hello" })],
                  attachments: [],
                },
              ],
              createdAt: 42,
              parentBranchId: null,
              branchFromMessageId: null,
            },
          },
        },
      }),
    ).toBe(true);
  });

  it("skips stale auto-initialized state after the current chat already has branches", () => {
    expect(
      shouldPersistInitializedChatState({
        currentState: {
          messages: [
            {
              id: "message-1",
              role: "user",
              content: [createMessageTextContent({ text: "hello" })],
              attachments: [],
            },
          ],
          inputText: "Draft input",
          waitingForResponse: false,
          toolCallArguments: {},
          activeBranchId: "branch-live",
          branches: {
            "branch-live": {
              messages: [
                {
                  id: "message-1",
                  role: "user",
                  content: [createMessageTextContent({ text: "hello" })],
                  attachments: [],
                },
              ],
              createdAt: 84,
              parentBranchId: null,
              branchFromMessageId: null,
            },
          },
        },
        initializedState: {
          messages: [
            {
              id: "message-1",
              role: "user",
              content: [createMessageTextContent({ text: "hello" })],
              attachments: [],
            },
          ],
          inputText: "Draft input",
          waitingForResponse: false,
          toolCallArguments: {},
          activeBranchId: "branch-stale",
          branches: {
            "branch-stale": {
              messages: [
                {
                  id: "message-1",
                  role: "user",
                  content: [createMessageTextContent({ text: "hello" })],
                  attachments: [],
                },
              ],
              createdAt: 42,
              parentBranchId: null,
              branchFromMessageId: null,
            },
          },
        },
      }),
    ).toBe(false);
  });

  it("skips stale auto-initialized state after the source messages change", () => {
    expect(
      shouldPersistInitializedChatState({
        currentState: {
          messages: [
            {
              id: "message-2",
              role: "user",
              content: [createMessageTextContent({ text: "newer" })],
              attachments: [],
            },
          ],
          inputText: "Draft input",
          waitingForResponse: false,
          toolCallArguments: {},
          activeBranchId: null,
          branches: {},
        },
        initializedState: {
          messages: [
            {
              id: "message-1",
              role: "user",
              content: [createMessageTextContent({ text: "older" })],
              attachments: [],
            },
          ],
          inputText: "Draft input",
          waitingForResponse: false,
          toolCallArguments: {},
          activeBranchId: "branch-stale",
          branches: {
            "branch-stale": {
              messages: [
                {
                  id: "message-1",
                  role: "user",
                  content: [createMessageTextContent({ text: "older" })],
                  attachments: [],
                },
              ],
              createdAt: 42,
              parentBranchId: null,
              branchFromMessageId: null,
            },
          },
        },
      }),
    ).toBe(false);
  });
});
