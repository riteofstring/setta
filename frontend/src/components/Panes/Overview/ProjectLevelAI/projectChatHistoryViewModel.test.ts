import {
  ChatRoleEnum,
  createAgentRun,
  createEngineConfig,
  createMessageTextContent,
  EngineTypeEnum,
  ExternalAgentRunModeEnum,
  ExternalAgentSettingsModeEnum,
  ExternalAgentToolTypeEnum,
  ExternalAgentWorkingDirStrategyEnum,
  type ExternalAgentConfig,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  buildOrderedVisibleThreadIds,
  buildProjectChatHistoryDisplayEntries,
  buildProjectChatHistorySearchState,
  buildProjectChatThreadSections,
  buildThreadAgentBadgeLabelByChatId,
  DRAFT_THREAD_LABEL,
  resolveProjectChatHistoryPollIntervalMs,
  type ProjectChatHistoryEntry,
  type ThreadGroup,
} from "./projectChatHistoryViewModel";

function createHistoryEntry(
  overrides: Partial<ProjectChatHistoryEntry>,
): ProjectChatHistoryEntry {
  return {
    chatId: "thread-1",
    label: "Thread",
    nameSource: null,
    lastUpdatedMs: 1,
    waitingForResponse: false,
    runType: "llm_chat",
    engineConfigId: null,
    ...overrides,
  };
}

function createExternalAgentConfig(
  overrides: Partial<ExternalAgentConfig>,
): ExternalAgentConfig {
  return {
    id: "external-agent-config",
    name: "External agent",
    description: "",
    toolType: ExternalAgentToolTypeEnum.codex,
    pluginAdapterId: null,
    runMode: ExternalAgentRunModeEnum.process,
    commandPath: null,
    baseUrl: null,
    defaultModel: null,
    sandboxPolicy: null,
    approvalPolicy: null,
    settingsMode: ExternalAgentSettingsModeEnum.managed_local,
    settingsSources: null,
    settingsFilePath: null,
    settingsAllowSettaEdits: true,
    settingsManagedBlock: null,
    envVarWhitelist: [],
    workingDirStrategy: ExternalAgentWorkingDirStrategyEnum.project_root,
    workingDir: null,
    codexSkipGitRepoCheck: null,
    ...overrides,
  };
}

describe("projectChatHistoryViewModel", () => {
  it("relabels an existing nameless draft thread instead of synthesizing a second entry", () => {
    // Existing unnamed draft runs should be shown as the draft placeholder without duplicating history rows.
    const result = buildProjectChatHistoryDisplayEntries({
      historyEntries: [
        createHistoryEntry({
          chatId: "draft-chat",
          label: "Untitled",
        }),
      ],
      draftThread: {
        chatId: "draft-chat",
        groupId: "group-a",
      },
      chatId: "draft-chat",
      runType: "llm_chat",
      engineConfigId: "engine-1",
    });

    expect(result.displayEntries[0]?.label).toBe(DRAFT_THREAD_LABEL);
    expect(result.syntheticDraftThreadEntry).toBeNull();
  });

  it("creates a synthetic draft thread when a new thread has not received a chat id yet", () => {
    // A fresh new-thread action still needs a visible history row before the first run is created.
    const result = buildProjectChatHistoryDisplayEntries({
      historyEntries: [],
      draftThread: {
        chatId: null,
        groupId: "group-a",
      },
      chatId: null,
      runType: "external_agent",
      engineConfigId: "engine-2",
    });

    expect(result.syntheticDraftThreadEntry).toEqual(
      expect.objectContaining({
        chatId: "__setta_project_chat_draft_thread__",
        label: DRAFT_THREAD_LABEL,
        waitingForResponse: true,
        runType: "external_agent",
        engineConfigId: "engine-2",
      }),
    );
  });

  it("filters and counts history search matches using both labels and run content", () => {
    // Search should include run transcript text, not just the latest derived conversation title.
    const result = buildProjectChatHistorySearchState({
      agentRuns: [
        createAgentRun({
          id: "run-1",
          inputs: {
            chatId: "thread-2",
            projectConfigId: "project-1",
            messages: [
              {
                id: "message-1",
                role: ChatRoleEnum.user,
                content: [
                  createMessageTextContent({
                    text: "Deploy the release pipeline",
                  }),
                ],
                attachments: [],
              },
            ],
          },
        }),
      ],
      displayEntries: [
        createHistoryEntry({
          chatId: "thread-1",
          label: "Architecture notes",
          lastUpdatedMs: 10,
        }),
        createHistoryEntry({
          chatId: "thread-2",
          label: "Release notes",
          lastUpdatedMs: 20,
        }),
      ],
      syntheticDraftThreadEntry: null,
      masterSearchInput: "deploy",
    });

    expect(result.hasMasterSearch).toBe(true);
    expect(result.sortedEntries.map((entry) => entry.chatId)).toEqual([
      "thread-2",
    ]);
    expect(result.masterSearchMatchCountByChatId.get("thread-2")).toBe(1);
  });

  it("builds grouped history sections and ordered visible ids from assignments, pins, and draft placement", () => {
    // Group partitioning must keep draft rows in their requested group and preserve explicit thread ordering.
    const threadGroups: Array<ThreadGroup> = [
      {
        id: "group-a",
        name: "Pinned",
        collapsed: false,
        pinned: true,
      },
      {
        id: "group-b",
        name: "Working",
        collapsed: false,
        pinned: false,
      },
    ];
    const { groupSections, ungroupedEntries } = buildProjectChatThreadSections({
      visibleSortedEntries: [
        createHistoryEntry({
          chatId: "thread-1",
          label: "Pinned thread",
          lastUpdatedMs: 50,
        }),
        createHistoryEntry({
          chatId: "thread-2",
          label: "Working thread",
          lastUpdatedMs: 40,
        }),
        createHistoryEntry({
          chatId: "thread-3",
          label: "Ungrouped thread",
          lastUpdatedMs: 30,
        }),
        createHistoryEntry({
          chatId: "__setta_project_chat_draft_thread__",
          label: DRAFT_THREAD_LABEL,
          lastUpdatedMs: Number.MAX_SAFE_INTEGER,
        }),
      ],
      draftThread: {
        chatId: null,
        groupId: "group-b",
      },
      threadGroups,
      threadAssignments: {
        "thread-1": "group-a",
        "thread-2": "group-b",
      },
      threadOrderIds: ["thread-2", "thread-1", "thread-3"],
      pinnedThreadIds: ["thread-1"],
    });

    expect(
      groupSections.map((section) =>
        section.entries.map((entry) => entry.chatId),
      ),
    ).toEqual([
      ["thread-1"],
      ["thread-2", "__setta_project_chat_draft_thread__"],
    ]);
    expect(ungroupedEntries.map((entry) => entry.chatId)).toEqual(["thread-3"]);
    expect(
      buildOrderedVisibleThreadIds({
        searchableGroupSections: groupSections,
        ungroupedEntries,
      }),
    ).toEqual(["thread-1", "thread-2", "thread-3"]);
  });

  it("resolves thread agent badges from llm and external-engine ownership", () => {
    // Badge labels should follow engine ownership rather than ad hoc string parsing in the component.
    const badgeLabels = buildThreadAgentBadgeLabelByChatId({
      visibleSortedEntries: [
        createHistoryEntry({
          chatId: "thread-1",
          runType: "llm_chat",
          engineConfigId: null,
        }),
        createHistoryEntry({
          chatId: "thread-2",
          runType: "external_agent",
          engineConfigId: "engine-codex",
        }),
      ],
      engineConfigs: [
        createEngineConfig({
          id: "engine-codex",
          name: "Codex engine",
          engineType: EngineTypeEnum.external_agent,
          externalAgentConfigId: "external-codex",
        }),
      ],
      externalAgentConfigs: [
        createExternalAgentConfig({
          id: "external-codex",
          toolType: ExternalAgentToolTypeEnum.codex,
        }),
      ],
    });

    expect(badgeLabels.get("thread-1")).toBe("setta");
    expect(badgeLabels.get("thread-2")).toBe("codex");
  });

  it("prioritizes missing-selected-chat polling over running and error states", () => {
    // The surface should repoll fastest when the selected thread has disappeared from the current history snapshot.
    expect(
      resolveProjectChatHistoryPollIntervalMs({
        hasLoadError: true,
        hasRunningHistoryEntry: true,
        selectedChatMissingFromHistory: true,
      }),
    ).toBe(1500);
  });
});
