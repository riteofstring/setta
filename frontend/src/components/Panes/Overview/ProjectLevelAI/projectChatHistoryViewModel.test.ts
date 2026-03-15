import type { ChatHistoryEntry } from "state/actions/chatHistoryTypes";
import {
  EngineTypeEnum,
  ExternalAgentRunModeEnum,
  ExternalAgentSettingsModeEnum,
  ExternalAgentToolTypeEnum,
  ExternalAgentWorkingDirStrategyEnum,
  createAgentRun,
  createEngineConfig,
  type AgentRun,
  type ExternalAgentConfig,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  DRAFT_THREAD_ENTRY_ID,
  buildProjectChatHistoryViewModel,
} from "./projectChatHistoryViewModel";

function buildHistoryEntry({
  chatId,
  engineConfigId = null,
  label,
  lastUpdatedMs,
  nameSource = "llm",
  runType = "llm_chat",
  waitingForResponse = false,
}: {
  chatId: string;
  engineConfigId?: string | null;
  label: string;
  lastUpdatedMs: number;
  nameSource?: ChatHistoryEntry["nameSource"];
  runType?: ChatHistoryEntry["runType"];
  waitingForResponse?: boolean;
}): ChatHistoryEntry {
  return {
    chatId,
    engineConfigId,
    label,
    lastUpdatedMs,
    nameSource,
    runType,
    waitingForResponse,
  };
}

function buildAgentRun({
  chatId,
  engineConfigId = null,
  id,
  outputName,
  outputNameSource = "llm",
  projectConfigId = "project-history-test",
  runType = "llm_chat",
  status = "completed",
  userMessage,
}: {
  chatId: string;
  engineConfigId?: string | null;
  id: string;
  outputName: string;
  outputNameSource?: "llm" | "deterministic" | "reused" | "external";
  projectConfigId?: string;
  runType?: "llm_chat" | "external_agent" | "scriptable_chat";
  status?: AgentRun["status"];
  userMessage: string;
}): AgentRun {
  return createAgentRun({
    id,
    startedAt: "2026-03-15T10:00:00Z",
    finishedAt: status === "running" ? null : "2026-03-15T10:00:05Z",
    inputs: {
      chatId,
      engineConfigId,
      messages: [
        {
          role: "user",
          content: [{ type: "text", text: userMessage }],
        },
      ],
      projectConfigId,
      runType,
    },
    outputs: {
      name: outputName,
      nameSource: outputNameSource,
    },
    status,
  });
}

function buildExternalAgentConfig({
  id,
  toolType,
}: {
  id: string;
  toolType: ExternalAgentToolTypeEnum;
}): ExternalAgentConfig {
  return {
    approvalPolicy: null,
    baseUrl: null,
    codexSkipGitRepoCheck: null,
    commandPath: null,
    defaultModel: null,
    description: "",
    envVarWhitelist: [],
    id,
    name: id,
    pluginAdapterId: null,
    runMode: ExternalAgentRunModeEnum.command,
    sandboxPolicy: null,
    settingsAllowSettaEdits: true,
    settingsFilePath: null,
    settingsManagedBlock: null,
    settingsMode: ExternalAgentSettingsModeEnum.managed_local,
    settingsSources: null,
    toolType,
    workingDir: null,
    workingDirStrategy: ExternalAgentWorkingDirStrategyEnum.project_root,
  };
}

describe("projectChatHistoryViewModel", () => {
  it("filters grouped and ungrouped entries by search text derived from run messages", () => {
    const historyEntries = [
      buildHistoryEntry({
        chatId: "chat-a",
        engineConfigId: "engine-setta",
        label: "Release notes",
        lastUpdatedMs: 300,
      }),
      buildHistoryEntry({
        chatId: "chat-b",
        engineConfigId: "engine-setta",
        label: "CI flakes",
        lastUpdatedMs: 200,
      }),
      buildHistoryEntry({
        chatId: "chat-c",
        engineConfigId: "engine-setta",
        label: "Launch review",
        lastUpdatedMs: 100,
      }),
    ];
    const agentRuns = [
      buildAgentRun({
        chatId: "chat-a",
        engineConfigId: "engine-setta",
        id: "run-a",
        outputName: "Release notes",
        userMessage: "deploy the release checklist",
      }),
      buildAgentRun({
        chatId: "chat-b",
        engineConfigId: "engine-setta",
        id: "run-b",
        outputName: "CI flakes",
        userMessage: "inspect nightly workflow failures",
      }),
      buildAgentRun({
        chatId: "chat-c",
        engineConfigId: "engine-setta",
        id: "run-c",
        outputName: "Launch review",
        userMessage: "deploy launch copy after approval",
      }),
    ];

    const viewModel = buildProjectChatHistoryViewModel({
      activeChatId: "chat-a",
      agentRuns,
      draftThread: null,
      engineConfigId: "engine-setta",
      engineConfigs: [
        createEngineConfig({
          engineType: EngineTypeEnum.setta_llm,
          id: "engine-setta",
          name: "Setta",
        }),
      ],
      externalAgentConfigs: [],
      historyEntries,
      initialLoadComplete: true,
      loadError: null,
      masterSearchInput: "deploy",
      pinnedThreadIds: ["chat-a"],
      runType: "llm_chat",
      threadAssignments: {
        "chat-a": "group-pinned",
        "chat-b": "group-backlog",
      },
      threadGroups: [
        {
          collapsed: false,
          id: "group-pinned",
          name: "Pinned Work",
          pinned: true,
        },
        {
          collapsed: false,
          id: "group-backlog",
          name: "Backlog",
          pinned: false,
        },
      ],
      threadOrderIds: ["chat-b", "chat-a", "chat-c"],
      trashedThreadIds: [],
    });

    // Search should include run-message text, not just thread labels.
    expect(viewModel.masterSearchMatchCount).toBe(2);
    expect(viewModel.orderedVisibleThreadIds).toEqual(["chat-a", "chat-c"]);
    expect(
      viewModel.pinnedSearchableGroupSections.map((section) =>
        section.entries.map((entry) => entry.chatId),
      ),
    ).toEqual([["chat-a"]]);
    expect(viewModel.ungroupedEntries.map((entry) => entry.chatId)).toEqual([
      "chat-c",
    ]);
    expect(viewModel.masterSearchMatchCountByChatId.get("chat-a")).toBe(1);
    expect(viewModel.masterSearchMatchCountByChatId.get("chat-c")).toBe(1);
  });

  it("places a synthetic draft thread into its selected group and suppresses the empty placeholder", () => {
    const viewModel = buildProjectChatHistoryViewModel({
      activeChatId: null,
      agentRuns: [],
      draftThread: { chatId: null, groupId: "group-drafts" },
      engineConfigId: "engine-setta",
      engineConfigs: [],
      externalAgentConfigs: [],
      historyEntries: [],
      initialLoadComplete: true,
      loadError: null,
      masterSearchInput: "",
      pinnedThreadIds: [],
      runType: "llm_chat",
      threadAssignments: {},
      threadGroups: [
        {
          collapsed: false,
          id: "group-drafts",
          name: "Drafts",
          pinned: false,
        },
      ],
      threadOrderIds: [],
      trashedThreadIds: [],
    });

    // Draft-only history should render the draft row instead of falling back to "No threads yet".
    expect(viewModel.placeholderText).toBe("");
    expect(viewModel.orderedVisibleThreadIds).toEqual([]);
    expect(
      viewModel.groupSections[0]?.entries.map((entry) => entry.chatId),
    ).toEqual([DRAFT_THREAD_ENTRY_ID]);
  });

  it("derives badge labels and group sortability from the grouped view model state", () => {
    const historyEntries = [
      buildHistoryEntry({
        chatId: "chat-setta",
        engineConfigId: null,
        label: "Setta thread",
        lastUpdatedMs: 300,
        runType: "llm_chat",
      }),
      buildHistoryEntry({
        chatId: "chat-codex",
        engineConfigId: "engine-codex",
        label: "Codex thread",
        lastUpdatedMs: 200,
        runType: "external_agent",
      }),
      buildHistoryEntry({
        chatId: "chat-claude",
        engineConfigId: "engine-claude",
        label: "Claude thread",
        lastUpdatedMs: 100,
        runType: "external_agent",
      }),
    ];

    const viewModel = buildProjectChatHistoryViewModel({
      activeChatId: "chat-setta",
      agentRuns: [],
      draftThread: null,
      engineConfigId: null,
      engineConfigs: [
        createEngineConfig({
          engineType: EngineTypeEnum.external_agent,
          externalAgentConfigId: "external-codex",
          id: "engine-codex",
          name: "Codex",
        }),
        createEngineConfig({
          engineType: EngineTypeEnum.external_agent,
          externalAgentConfigId: "external-claude",
          id: "engine-claude",
          name: "Claude",
        }),
      ],
      externalAgentConfigs: [
        buildExternalAgentConfig({
          id: "external-codex",
          toolType: ExternalAgentToolTypeEnum.codex,
        }),
        buildExternalAgentConfig({
          id: "external-claude",
          toolType: ExternalAgentToolTypeEnum.claude_code,
        }),
      ],
      historyEntries,
      initialLoadComplete: true,
      loadError: null,
      masterSearchInput: "",
      pinnedThreadIds: [],
      runType: "llm_chat",
      threadAssignments: {
        "chat-setta": "group-pinned",
        "chat-codex": "group-backlog-a",
        "chat-claude": "group-backlog-b",
      },
      threadGroups: [
        {
          collapsed: false,
          id: "group-pinned",
          name: "Pinned Work",
          pinned: true,
        },
        {
          collapsed: false,
          id: "group-backlog-a",
          name: "Backlog A",
          pinned: false,
        },
        {
          collapsed: false,
          id: "group-backlog-b",
          name: "Backlog B",
          pinned: false,
        },
      ],
      threadOrderIds: ["chat-setta", "chat-codex", "chat-claude"],
      trashedThreadIds: [],
    });

    // Badge labels and group drag toggles should stay tied to the same grouped-history state.
    expect(viewModel.threadAgentBadgeLabelByChatId.get("chat-setta")).toBe(
      "setta",
    );
    expect(viewModel.threadAgentBadgeLabelByChatId.get("chat-codex")).toBe(
      "codex",
    );
    expect(viewModel.threadAgentBadgeLabelByChatId.get("chat-claude")).toBe(
      "claude",
    );
    expect(viewModel.groupsSortableEnabled).toBe(true);
    expect(viewModel.groupSortableEnabledById.get("group-pinned")).toBe(false);
    expect(viewModel.groupSortableEnabledById.get("group-backlog-a")).toBe(
      true,
    );
    expect(viewModel.groupSortableEnabledById.get("group-backlog-b")).toBe(
      true,
    );
  });
});
