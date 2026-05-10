import {
  createAgentRun,
  createMessageTextContent,
  createUserChatMessage,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { buildProjectChatSubmittedMessageHistory } from "./projectChatCoreUtils";

describe("buildProjectChatSubmittedMessageHistory", () => {
  it("collects user prompts in recency order across project conversations", () => {
    // The newest active composer conversation should be searched first, then
    // latest runs per chat sorted by last update time.
    const prompts = buildProjectChatSubmittedMessageHistory({
      projectConfigId: "project-a",
      activeMessages: [
        createUserChatMessage({
          id: "active-older",
          content: [createMessageTextContent({ text: "Older current prompt" })],
        }),
        createUserChatMessage({
          id: "active-newest",
          content: [
            createMessageTextContent({ text: "Draft in current chat" }),
          ],
        }),
      ],
      runs: [
        createAgentRun({
          id: "run-chat-1-old",
          startedAt: "2025-01-01T00:00:00Z",
          inputs: {
            runType: "llm_chat",
            chatId: "chat-1",
            projectConfigId: "project-a",
            sectionId: null,
          },
          outputs: {
            messages: [
              createUserChatMessage({
                content: [createMessageTextContent({ text: "Stale prompt" })],
              }),
            ],
          },
        }),
        createAgentRun({
          id: "run-chat-1-new",
          startedAt: "2025-01-03T00:00:00Z",
          inputs: {
            runType: "llm_chat",
            chatId: "chat-1",
            projectConfigId: "project-a",
            sectionId: null,
          },
          outputs: {
            messages: [
              createUserChatMessage({
                content: [createMessageTextContent({ text: "Prompt A" })],
              }),
              createUserChatMessage({
                content: [createMessageTextContent({ text: "Prompt B" })],
              }),
            ],
          },
        }),
        createAgentRun({
          id: "run-chat-2",
          startedAt: "2025-01-02T00:00:00Z",
          inputs: {
            runType: "external_agent",
            chatId: "chat-2",
            projectConfigId: "project-a",
            sectionId: null,
          },
          outputs: {
            messages: [
              createUserChatMessage({
                content: [createMessageTextContent({ text: "Prompt C" })],
              }),
            ],
          },
        }),
        createAgentRun({
          id: "run-chat-section",
          startedAt: "2025-01-04T00:00:00Z",
          inputs: {
            runType: "llm_chat",
            chatId: "chat-section",
            projectConfigId: "project-a",
            sectionId: "section-1",
          },
          outputs: {
            messages: [
              createUserChatMessage({
                content: [createMessageTextContent({ text: "Scoped prompt" })],
              }),
            ],
          },
        }),
      ],
    });

    expect(prompts).toEqual([
      "Draft in current chat",
      "Older current prompt",
      "Prompt B",
      "Prompt A",
      "Prompt C",
    ]);
  });

  it("does not include unscoped runs when scoped project runs are absent", () => {
    // Project-level history is strictly scoped to the active project id.
    const prompts = buildProjectChatSubmittedMessageHistory({
      projectConfigId: "project-missing",
      activeMessages: [],
      runs: [
        createAgentRun({
          id: "run-fallback",
          startedAt: "2025-01-01T00:00:00Z",
          inputs: {
            runType: "llm_chat",
            chatId: "chat-fallback",
            projectConfigId: null,
            sectionId: null,
          },
          outputs: {
            messages: [
              createUserChatMessage({
                content: [
                  createMessageTextContent({ text: "Fallback prompt" }),
                ],
              }),
            ],
          },
        }),
      ],
    });

    expect(prompts).toEqual([]);
  });

  it("deduplicates prompts while preserving first-seen ordering", () => {
    // Duplicate prompts from active and run history should only appear once.
    const prompts = buildProjectChatSubmittedMessageHistory({
      projectConfigId: "project-a",
      activeMessages: [
        createUserChatMessage({
          content: [createMessageTextContent({ text: "Repeated prompt" })],
        }),
      ],
      runs: [
        createAgentRun({
          id: "run-duplicate",
          startedAt: "2025-01-01T00:00:00Z",
          inputs: {
            runType: "llm_chat",
            chatId: "chat-1",
            projectConfigId: "project-a",
            sectionId: null,
          },
          outputs: {
            messages: [
              createUserChatMessage({
                content: [
                  createMessageTextContent({ text: "Repeated prompt" }),
                ],
              }),
              createUserChatMessage({
                content: [createMessageTextContent({ text: "Unique prompt" })],
              }),
            ],
          },
        }),
      ],
    });

    expect(prompts).toEqual(["Repeated prompt", "Unique prompt"]);
  });
});
