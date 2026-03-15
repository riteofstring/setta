import { resolveSlashCommandRequest } from "components/Chat/chatInputSubmission";
import { createAgentRun, EngineTypeEnum } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  resolveProjectChatComposerExecutableNativeSlashCommandTokens,
  resolveProjectChatComposerNativeSlashCommandTokens,
  resolveProjectChatComposerSlashCommandSets,
  resolveProjectChatRuntimeNativeSlashCommandTokens,
} from "./ProjectChatCore";

describe("project chat slash command authority integration", () => {
  it("keeps native commands scoped to the active external-agent engine across recognition and execution", () => {
    // The active engine should only recognize and execute its own native commands.
    const runtimeTokens = resolveProjectChatRuntimeNativeSlashCommandTokens({
      runs: [
        createAgentRun({
          id: "run-engine-a",
          inputs: {
            projectConfigId: "project-a",
          },
          outputs: {
            metadata: {
              engineConfigId: "engine-a",
              agentNativeSlashCommands: ["/deploy"],
            },
          },
        }),
        createAgentRun({
          id: "run-engine-b",
          inputs: {
            projectConfigId: "project-a",
          },
          outputs: {
            metadata: {
              engineConfigId: "engine-b",
              agentNativeSlashCommands: ["/review"],
            },
          },
        }),
      ],
      projectConfigId: "project-a",
      engineConfigId: "engine-a",
      engineType: EngineTypeEnum.external_agent,
    });
    const loadingSets = resolveProjectChatComposerSlashCommandSets({
      customProjectChatSlashCommands: [],
      discoveredAgentNativeSlashCommands:
        resolveProjectChatComposerNativeSlashCommandTokens({
          runtimeNativeSlashCommandTokens: runtimeTokens,
          agentRunsAuthorityState: "loading",
        }),
      executableAgentNativeSlashCommands:
        resolveProjectChatComposerExecutableNativeSlashCommandTokens({
          runtimeNativeSlashCommandTokens: runtimeTokens,
          agentRunsAuthorityState: "loading",
        }),
      showPermissionExecutionControl: true,
      showSearchExecutionControl: false,
    });

    expect(
      resolveSlashCommandRequest({
        message: "/deploy now",
        slashCommands: loadingSets.slashCommands,
        recognizedSlashCommands: loadingSets.recognizedSlashCommands,
      }).parsed,
    ).toBeNull();

    const readySets = resolveProjectChatComposerSlashCommandSets({
      customProjectChatSlashCommands: [],
      discoveredAgentNativeSlashCommands:
        resolveProjectChatComposerNativeSlashCommandTokens({
          runtimeNativeSlashCommandTokens: runtimeTokens,
          agentRunsAuthorityState: "ready",
        }),
      executableAgentNativeSlashCommands:
        resolveProjectChatComposerExecutableNativeSlashCommandTokens({
          runtimeNativeSlashCommandTokens: runtimeTokens,
          agentRunsAuthorityState: "ready",
        }),
      showPermissionExecutionControl: true,
      showSearchExecutionControl: false,
    });
    const activeEngineRequest = resolveSlashCommandRequest({
      message: "/deploy now",
      slashCommands: readySets.slashCommands,
      recognizedSlashCommands: readySets.recognizedSlashCommands,
    });
    const foreignEngineRequest = resolveSlashCommandRequest({
      message: "/review now",
      slashCommands: readySets.slashCommands,
      recognizedSlashCommands: readySets.recognizedSlashCommands,
    });

    expect(activeEngineRequest.parsed?.action).toBe("native_prompt");
    expect(activeEngineRequest.commandAvailable).toBe(true);
    expect(foreignEngineRequest.parsed).toBeNull();
    expect(foreignEngineRequest.commandAvailable).toBe(false);
  });

  it("keeps external-agent native commands out of the composer when the active engine is Setta LLM", () => {
    // Non-external engines should never surface external-agent native commands.
    const runtimeTokens = resolveProjectChatRuntimeNativeSlashCommandTokens({
      runs: [
        createAgentRun({
          id: "run-engine-a",
          inputs: {
            projectConfigId: "project-a",
          },
          outputs: {
            metadata: {
              engineConfigId: "engine-a",
              agentNativeSlashCommands: ["/deploy"],
            },
          },
        }),
      ],
      projectConfigId: "project-a",
      engineConfigId: "engine-llm",
      engineType: EngineTypeEnum.setta_llm,
    });
    const readySets = resolveProjectChatComposerSlashCommandSets({
      customProjectChatSlashCommands: [],
      discoveredAgentNativeSlashCommands:
        resolveProjectChatComposerNativeSlashCommandTokens({
          runtimeNativeSlashCommandTokens: runtimeTokens,
          agentRunsAuthorityState: "ready",
        }),
      executableAgentNativeSlashCommands:
        resolveProjectChatComposerExecutableNativeSlashCommandTokens({
          runtimeNativeSlashCommandTokens: runtimeTokens,
          agentRunsAuthorityState: "ready",
        }),
      showPermissionExecutionControl: true,
      showSearchExecutionControl: true,
    });

    expect(runtimeTokens).toEqual([]);
    expect(
      resolveSlashCommandRequest({
        message: "/deploy now",
        slashCommands: readySets.slashCommands,
        recognizedSlashCommands: readySets.recognizedSlashCommands,
      }).parsed,
    ).toBeNull();
  });
});
