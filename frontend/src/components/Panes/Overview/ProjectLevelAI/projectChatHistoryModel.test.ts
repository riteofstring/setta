import { describe, expect, it } from "vitest";

import {
  EngineTypeEnum,
  ToolTypeEnum,
  type EngineConfig,
  type ExternalAgentConfig,
} from "utils/generatedTypes";
import { resolveThreadAgentBadgeLabel } from "./projectChatHistoryModel";
import { type ProjectChatHistoryEntry } from "./projectChatHistoryShared";

function buildHistoryEntry(
  overrides: Partial<ProjectChatHistoryEntry> = {},
): ProjectChatHistoryEntry {
  return {
    chatId: "thread-1",
    label: "Thread 1",
    nameSource: null,
    lastUpdatedMs: 1,
    waitingForResponse: false,
    runType: "llm_chat",
    engineConfigId: null,
    ...overrides,
  } as ProjectChatHistoryEntry;
}

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

describe("resolveThreadAgentBadgeLabel", () => {
  it("keeps the managed-chat fallback label when the saved engine config is gone", () => {
    expect(
      resolveThreadAgentBadgeLabel({
        entry: buildHistoryEntry({
          engineConfigId: "missing-engine",
          runType: "llm_chat",
        }),
        engineConfigById: new Map(),
        externalAgentConfigById: new Map(),
      }),
    ).toBe("setta");
  });

  it("returns the managed badge for setta engines", () => {
    expect(
      resolveThreadAgentBadgeLabel({
        entry: buildHistoryEntry({ engineConfigId: "engine-1" }),
        engineConfigById: new Map([
          ["engine-1", buildEngineConfig({ id: "engine-1" })],
        ]),
        externalAgentConfigById: new Map(),
      }),
    ).toBe("setta");
  });

  it.each([
    [ToolTypeEnum.codex, "codex"],
    [ToolTypeEnum.claude_code, "claude"],
  ])(
    "maps supported external agent tool types to badge labels",
    (toolType, expectedLabel) => {
      expect(
        resolveThreadAgentBadgeLabel({
          entry: buildHistoryEntry({ engineConfigId: "engine-1" }),
          engineConfigById: new Map([
            [
              "engine-1",
              buildEngineConfig({
                id: "engine-1",
                engineType: EngineTypeEnum.external_agent,
                externalAgentConfigId: "external-1",
              }),
            ],
          ]),
          externalAgentConfigById: new Map([
            [
              "external-1",
              buildExternalAgentConfig({
                id: "external-1",
                toolType,
              }),
            ],
          ]),
        }),
      ).toBe(expectedLabel);
    },
  );

  it("returns null for unsupported external agent tool types", () => {
    expect(
      resolveThreadAgentBadgeLabel({
        entry: buildHistoryEntry({
          runType: "external_agent",
          engineConfigId: "engine-1",
        }),
        engineConfigById: new Map([
          [
            "engine-1",
            buildEngineConfig({
              id: "engine-1",
              engineType: EngineTypeEnum.external_agent,
              externalAgentConfigId: "external-1",
            }),
          ],
        ]),
        externalAgentConfigById: new Map([
          [
            "external-1",
            buildExternalAgentConfig({
              id: "external-1",
              toolType: "unsupported_tool" as ToolTypeEnum,
            }),
          ],
        ]),
      }),
    ).toBeNull();
  });
});
