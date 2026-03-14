/* @vitest-environment jsdom */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.hoisted(() => {
  class ResizeObserver {
    disconnect() {}
    observe() {}
    unobserve() {}
  }

  Object.defineProperty(globalThis, "ResizeObserver", {
    configurable: true,
    value: ResizeObserver,
  });
});

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import {
  createEngineConfig,
  EngineTypeEnum,
  ExternalAgentRunModeEnum,
  ExternalAgentSettingsModeEnum,
  ExternalAgentToolTypeEnum,
  ExternalAgentWorkingDirStrategyEnum,
  type ExternalAgentConfig,
} from "utils/generatedTypes";
import {
  type ProjectChatHistoryEntry,
  type ThreadGroup,
} from "./projectChatHistoryViewModel";
import { useProjectChatHistorySurfaceState } from "./useProjectChatHistorySurfaceState";

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

type HarnessProps = Parameters<typeof useProjectChatHistorySurfaceState>[0];

let latestState: ReturnType<typeof useProjectChatHistorySurfaceState> | null =
  null;

function SurfaceStateHarness(props: HarnessProps) {
  latestState = useProjectChatHistorySurfaceState(props);
  return null;
}

describe("useProjectChatHistorySurfaceState", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    latestState = null;
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    latestState = null;
  });

  it("owns visible history grouping, sortable ids, and badge-label derivation for the history surface", async () => {
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

    await act(async () => {
      root.render(
        <SurfaceStateHarness
          sortedEntries={[
            createHistoryEntry({
              chatId: "thread-1",
              label: "Pinned thread",
              lastUpdatedMs: 30,
            }),
            createHistoryEntry({
              chatId: "thread-2",
              label: "Trashed thread",
              lastUpdatedMs: 20,
            }),
            createHistoryEntry({
              chatId: "thread-3",
              label: "External thread",
              lastUpdatedMs: 10,
              runType: "external_agent",
              engineConfigId: "engine-codex",
            }),
          ]}
          draftThread={null}
          threadGroups={threadGroups}
          threadAssignments={{
            "thread-1": "group-a",
            "thread-2": "group-b",
          }}
          threadOrderIds={["thread-2", "thread-1", "thread-3"]}
          viewedThreadIds={["thread-1"]}
          pinnedThreadIds={["thread-1"]}
          trashedThreadIds={["thread-2"]}
          engineConfigs={[
            createEngineConfig({
              id: "engine-codex",
              name: "Codex engine",
              engineType: EngineTypeEnum.external_agent,
              externalAgentConfigId: "external-codex",
            }),
          ]}
          externalAgentConfigs={[
            createExternalAgentConfig({
              id: "external-codex",
              toolType: ExternalAgentToolTypeEnum.codex,
            }),
          ]}
          hasMasterSearch={false}
          initialLoadComplete={true}
          loadError={null}
        />,
      );
    });

    if (!latestState) {
      throw new Error("Expected a surface state result.");
    }

    // The extracted hook should keep all grouped/ungrouped history derivation in one owner.
    expect(Array.from(latestState.viewedThreadIdsSet)).toEqual(["thread-1"]);
    expect(Array.from(latestState.pinnedThreadIdsSet)).toEqual(["thread-1"]);
    expect(latestState.ungroupedEntries.map((entry) => entry.chatId)).toEqual([
      "thread-3",
    ]);
    expect(
      latestState.searchableGroupSections.map((section) => ({
        id: section.id,
        entries: section.entries.map((entry) => entry.chatId),
      })),
    ).toEqual([
      { id: "group-a", entries: ["thread-1"] },
      { id: "group-b", entries: [] },
    ]);
    expect(latestState.pinnedSortableGroupDndIds).toEqual([
      "project-chat-thread-group::group-a",
    ]);
    expect(latestState.unpinnedSortableGroupDndIds).toEqual([
      "project-chat-thread-group::group-b",
    ]);
    expect(latestState.orderedVisibleThreadIds).toEqual([
      "thread-1",
      "thread-3",
    ]);
    expect(latestState.threadGroupById.get("thread-1")).toBe("group-a");
    expect(latestState.threadPinnedById.get("thread-1")).toBe(true);
    expect(latestState.threadAgentBadgeLabelByChatId.get("thread-3")).toBe(
      "codex",
    );
    expect(latestState.threadsSortableEnabled).toBe(true);
    expect(latestState.showNoThreadsPlaceholder).toBe(false);
  });

  it("owns the no-content placeholder and master-search empty-state branching", async () => {
    await act(async () => {
      root.render(
        <SurfaceStateHarness
          sortedEntries={[]}
          draftThread={null}
          threadGroups={[]}
          threadAssignments={{}}
          threadOrderIds={[]}
          viewedThreadIds={[]}
          pinnedThreadIds={[]}
          trashedThreadIds={[]}
          engineConfigs={[]}
          externalAgentConfigs={[]}
          hasMasterSearch={false}
          initialLoadComplete={true}
          loadError={null}
        />,
      );
    });

    if (!latestState) {
      throw new Error("Expected an initial surface state result.");
    }

    expect(latestState.emptyStateText).toBe("No threads yet");
    expect(latestState.showNoThreadsPlaceholder).toBe(true);

    await act(async () => {
      root.render(
        <SurfaceStateHarness
          sortedEntries={[]}
          draftThread={null}
          threadGroups={[]}
          threadAssignments={{}}
          threadOrderIds={[]}
          viewedThreadIds={[]}
          pinnedThreadIds={[]}
          trashedThreadIds={[]}
          engineConfigs={[]}
          externalAgentConfigs={[]}
          hasMasterSearch={true}
          initialLoadComplete={true}
          loadError={null}
        />,
      );
    });

    expect(latestState.emptyStateText).toBe(
      "No conversations match this filter.",
    );
    expect(latestState.showNoThreadsPlaceholder).toBe(false);
  });
});
