/* @vitest-environment jsdom */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import {
  createAgentRun,
  EngineTypeEnum,
  ToolTypeEnum,
  type AgentRun,
  type EngineConfig,
  type ExternalAgentConfig,
} from "utils/generatedTypes";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useProjectChatHistoryModel } from "./projectChatHistoryModel";

vi.hoisted(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }

  Object.assign(globalThis, {
    ResizeObserver: ResizeObserverStub,
  });
});

type HistoryModel = ReturnType<typeof useProjectChatHistoryModel>;
type HarnessProps = {
  agentRuns?: Array<AgentRun>;
  engineConfigs?: Array<EngineConfig>;
  externalAgentConfigs?: Array<ExternalAgentConfig>;
  registerModel: (model: HistoryModel) => void;
};

function buildEngineConfig(
  overrides: Partial<EngineConfig> = {},
): EngineConfig {
  return {
    id: "engine-1",
    engineType: EngineTypeEnum.setta_llm,
    externalAgentConfigId: null,
    ...overrides,
  } as EngineConfig;
}

function buildExternalAgentConfig(
  overrides: Partial<ExternalAgentConfig> = {},
): ExternalAgentConfig {
  return {
    id: "external-1",
    toolType: ToolTypeEnum.codex,
    ...overrides,
  } as ExternalAgentConfig;
}

function HistoryModelHarness({
  agentRuns = [],
  engineConfigs = [],
  externalAgentConfigs = [],
  registerModel,
}: HarnessProps) {
  const threadListScrollRef = React.useRef<HTMLDivElement | null>(null);
  const model = useProjectChatHistoryModel({
    agentRuns,
    agentRunsInitialLoadComplete: true,
    agentRunsLoadError: null,
    chatId: null,
    draftThread: null,
    engineConfigId: null,
    engineConfigs,
    externalAgentConfigs,
    groupsSortableEnabledOverride: false,
    masterSearchInput: "",
    projectConfigId: "project-1",
    runType: null,
    threadAssignments: {},
    threadGroups: [],
    threadListScrollRef,
    threadOrderIds: [],
    pinnedThreadIds: [],
    trashedThreadIds: [],
    viewedThreadIds: [],
  });

  React.useEffect(() => {
    registerModel(model);
  }, [model, registerModel]);

  return React.createElement("div", { ref: threadListScrollRef });
}

function buildChatRun(
  overrides: {
    chatId?: string;
    engineConfigId?: string | null;
    id?: string;
    runType?: string | null;
  } = {},
): AgentRun {
  const chatId = overrides.chatId ?? "thread-1";
  return createAgentRun({
    id: overrides.id ?? `run-${chatId}`,
    inputs: {
      chatId,
      engineConfigId: overrides.engineConfigId ?? null,
      projectConfigId: "project-1",
      runType: overrides.runType ?? "llm_chat",
    },
    outputs: {
      name: `Thread ${chatId}`,
    },
  });
}

async function renderHistoryModel(
  props: Omit<HarnessProps, "registerModel"> = {},
): Promise<{ root: Root; readBadgeLabel: (chatId: string) => string | null }> {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  let currentModel: HistoryModel | null = null;

  await act(async () => {
    root.render(
      React.createElement(HistoryModelHarness, {
        ...props,
        registerModel: (model: HistoryModel) => {
          currentModel = model;
        },
      }),
    );
  });

  return {
    root,
    readBadgeLabel: (chatId: string) => {
      if (!currentModel) {
        throw new Error("history model was not registered");
      }
      return currentModel.threadAgentBadgeLabelByChatId.get(chatId) ?? null;
    },
  };
}

afterEach(async () => {
  document.body.innerHTML = "";
});

describe("useProjectChatHistoryModel thread badges", () => {
  it("keeps the managed-chat fallback label when the saved engine config is gone", async () => {
    const harness = await renderHistoryModel({
      agentRuns: [
        buildChatRun({
          engineConfigId: "missing-engine",
          runType: "llm_chat",
        }),
      ],
    });

    expect(harness.readBadgeLabel("thread-1")).toBe("setta");

    await act(async () => {
      harness.root.unmount();
    });
  });

  it("returns the managed badge for setta engines", async () => {
    const harness = await renderHistoryModel({
      agentRuns: [
        buildChatRun({
          engineConfigId: "engine-1",
        }),
      ],
      engineConfigs: [buildEngineConfig({ id: "engine-1" })],
    });

    expect(harness.readBadgeLabel("thread-1")).toBe("setta");

    await act(async () => {
      harness.root.unmount();
    });
  });

  it.each([
    [ToolTypeEnum.codex, "codex"],
    [ToolTypeEnum.claude_code, "claude"],
  ])(
    "maps supported external agent tool types to badge labels",
    async (toolType, expectedLabel) => {
      const harness = await renderHistoryModel({
        agentRuns: [
          buildChatRun({
            engineConfigId: "engine-1",
            runType: "external_agent",
          }),
        ],
        engineConfigs: [
          buildEngineConfig({
            id: "engine-1",
            engineType: EngineTypeEnum.external_agent,
            externalAgentConfigId: "external-1",
          }),
        ],
        externalAgentConfigs: [
          buildExternalAgentConfig({
            id: "external-1",
            toolType,
          }),
        ],
      });

      expect(harness.readBadgeLabel("thread-1")).toBe(expectedLabel);

      await act(async () => {
        harness.root.unmount();
      });
    },
  );

  it("returns null for unsupported external agent tool types", async () => {
    const harness = await renderHistoryModel({
      agentRuns: [
        buildChatRun({
          engineConfigId: "engine-1",
          runType: "external_agent",
        }),
      ],
      engineConfigs: [
        buildEngineConfig({
          id: "engine-1",
          engineType: EngineTypeEnum.external_agent,
          externalAgentConfigId: "external-1",
        }),
      ],
      externalAgentConfigs: [
        buildExternalAgentConfig({
          id: "external-1",
          toolType: "unsupported_tool" as ToolTypeEnum,
        }),
      ],
    });

    expect(harness.readBadgeLabel("thread-1")).toBeNull();

    await act(async () => {
      harness.root.unmount();
    });
  });
});
