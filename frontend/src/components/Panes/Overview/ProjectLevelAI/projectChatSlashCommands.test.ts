import {
  resolveSlashCommandRequest,
  type ChatSlashCommand,
} from "components/Chat/ChatInput";
import { createAgentRun, EngineTypeEnum } from "utils/generatedTypes";
import { describe, expect, it, vi } from "vitest";
import {
  executeProjectChatSlashCommand,
  handleUnknownProjectChatSlashCommand,
  resolveProjectChatSlashCommandState,
} from "./projectChatSlashCommands";

describe("projectChatSlashCommands", () => {
  it("keeps native slash commands unavailable until agent-run authority is ready", () => {
    const loadingState = resolveProjectChatSlashCommandState({
      agentRuns: [
        createAgentRun({
          id: "run-1",
          inputs: {
            projectConfigId: "project-1",
          },
          outputs: {
            metadata: {
              engineConfigId: "engine-1",
              agentNativeSlashCommands: ["/deploy"],
            },
          },
        }),
      ],
      agentRunsAuthorityState: "loading",
      projectConfigId: "project-1",
      engineConfigId: "engine-1",
      engineType: EngineTypeEnum.external_agent,
      customProjectChatSlashCommands: [
        {
          command: "/release",
          prompt: "Cut a release.",
        },
      ],
      isExternalEngine: true,
      showPermissionExecutionControl: true,
      showSearchExecutionControl: false,
    });
    const readyState = resolveProjectChatSlashCommandState({
      agentRuns: [
        createAgentRun({
          id: "run-1",
          inputs: {
            projectConfigId: "project-1",
          },
          outputs: {
            metadata: {
              engineConfigId: "engine-1",
              agentNativeSlashCommands: ["/deploy"],
            },
          },
        }),
      ],
      agentRunsAuthorityState: "ready",
      projectConfigId: "project-1",
      engineConfigId: "engine-1",
      engineType: EngineTypeEnum.external_agent,
      customProjectChatSlashCommands: [
        {
          command: "/release",
          prompt: "Cut a release.",
        },
      ],
      isExternalEngine: true,
      showPermissionExecutionControl: true,
      showSearchExecutionControl: false,
    });

    expect(
      loadingState.recognizedSlashCommands.some(
        (command) => command.command === "/deploy",
      ),
    ).toBe(false);
    expect(
      loadingState.recognizedSlashCommands.find(
        (command) => command.command === "/release",
      )?.unavailableFeedback,
    ).toBe(
      "Custom slash commands are unavailable until native command authority is loaded for this project.",
    );
    expect(
      readyState.recognizedSlashCommands.some(
        (command) => command.command === "/deploy",
      ),
    ).toBe(true);
  });

  it("executes managed slash commands with project-chat specific feedback wiring", async () => {
    const executeManagedChatSlashCommand = vi.fn(async () => ({
      feedback: "handled",
    }));
    const onSetPermissionMode = vi.fn();
    const onSetSearchEnabled = vi.fn();
    const onSetAppGenerationMode = vi.fn();

    const result = await executeProjectChatSlashCommand({
      command: {
        command: "/help",
        action: "help",
        args: [],
      } satisfies ChatSlashCommand,
      slashCommands: [],
      onStartNewChat: vi.fn(),
      onResumeLatestChat: async () => true,
      onSetPermissionMode,
      searchEnabled: true,
      onSetSearchEnabled,
      appGenerationMode: "json_render",
      onSetAppGenerationMode,
      dependencies: {
        executeManagedChatSlashCommand,
      },
    });

    expect(result).toEqual({
      feedback: "handled",
    });
    expect(executeManagedChatSlashCommand).toHaveBeenCalledWith(
      expect.objectContaining({
        resumeFeedback: {
          success: "Resumed the latest project chat.",
          notFound: "No previous project chat found to resume.",
        },
        modelFeedback: "Use the model selector in the Project AI Chat toolbar.",
        onSetPermissionMode,
        searchEnabled: true,
        onSetSearchEnabled,
        onSetAppGenerationMode,
      }),
    );
  });

  it("reloads agent metadata for unknown slash commands and returns refreshed command sets", async () => {
    const refreshedState = {
      agentRuns: [
        createAgentRun({
          id: "run-1",
          inputs: {
            projectConfigId: "project-1",
          },
          outputs: {
            metadata: {
              engineConfigId: "engine-1",
              agentNativeSlashCommands: ["/deploy"],
            },
          },
        }),
      ],
      agentRunsAuthorityState: "ready" as const,
    };

    const result = await handleUnknownProjectChatSlashCommand({
      message: "/deploy latest build",
      isExternalEngine: true,
      agentRunsAuthorityState: "loading",
      getRefreshedState: () => refreshedState,
      resolveSlashCommandState: (state) =>
        resolveProjectChatSlashCommandState({
          agentRuns: state.agentRuns,
          agentRunsAuthorityState: state.agentRunsAuthorityState,
          projectConfigId: "project-1",
          engineConfigId: "engine-1",
          engineType: EngineTypeEnum.external_agent,
          customProjectChatSlashCommands: [],
          isExternalEngine: true,
          showPermissionExecutionControl: true,
          showSearchExecutionControl: false,
        }),
      dependencies: {
        loadAgentRuns: async () => undefined,
      },
    });

    expect(result).toEqual({
      refreshedSlashCommands: expect.arrayContaining([
        expect.objectContaining({ command: "/deploy" }),
      ]),
      refreshedRecognizedSlashCommands: expect.arrayContaining([
        expect.objectContaining({ command: "/deploy" }),
      ]),
    });
  });

  it("keeps the input when authority is still unavailable after a reload", async () => {
    const result = await handleUnknownProjectChatSlashCommand({
      message: "/deploy latest build",
      isExternalEngine: true,
      agentRunsAuthorityState: "loading",
      getRefreshedState: () => ({
        agentRuns: [],
        agentRunsAuthorityState: "loading",
      }),
      resolveSlashCommandState: () => ({
        slashCommands: [],
        recognizedSlashCommands: [],
      }),
      dependencies: {
        loadAgentRuns: async () => undefined,
        resolveSlashCommandRequest,
      },
    });

    expect(result).toEqual({
      handled: true,
      feedback:
        "Native slash commands are unavailable until agent metadata reloads.",
      keepInput: true,
    });
  });
});
