import { describe, expect, it } from "vitest";

import {
  parseAgentNativeSlashCommandsStorage,
  resolveSkillPreviewContent,
  shouldPollSlashCommandAgentRuns,
} from "./ProjectChatSkillsMcpViewer";

describe("parseAgentNativeSlashCommandsStorage", () => {
  it("ignores legacy array-shaped storage entries", () => {
    const parsed = parseAgentNativeSlashCommandsStorage(
      JSON.stringify({
        "engine-1": ["/legacy"],
      }),
    );

    expect(parsed).toEqual({});
  });

  it("hydrates canonical object-shaped entries", () => {
    const parsed = parseAgentNativeSlashCommandsStorage(
      JSON.stringify({
        "engine-1": {
          commands: [" /help ", "/status"],
          status: "available",
          statusDetail: "Loaded from run metadata",
        },
      }),
    );

    expect(parsed).toEqual({
      "engine-1": {
        commands: ["/help", "/status"],
        status: "available",
        statusDetail: "Loaded from run metadata",
      },
    });
  });
});

describe("shouldPollSlashCommandAgentRuns", () => {
  it("enables polling only for slash commands view with external-agent engines", () => {
    expect(
      shouldPollSlashCommandAgentRuns({
        viewMode: "slash_commands",
        selectedEngineType: "external_agent",
      }),
    ).toBe(true);
  });

  it("disables polling outside slash commands view", () => {
    expect(
      shouldPollSlashCommandAgentRuns({
        viewMode: "skills",
        selectedEngineType: "external_agent",
      }),
    ).toBe(false);
    expect(
      shouldPollSlashCommandAgentRuns({
        viewMode: "mcp",
        selectedEngineType: "external_agent",
      }),
    ).toBe(false);
  });

  it("disables polling for non-external engines", () => {
    expect(
      shouldPollSlashCommandAgentRuns({
        viewMode: "slash_commands",
        selectedEngineType: "setta_llm",
      }),
    ).toBe(false);
    expect(
      shouldPollSlashCommandAgentRuns({
        viewMode: "slash_commands",
        selectedEngineType: null,
      }),
    ).toBe(false);
  });
});

describe("resolveSkillPreviewContent", () => {
  it("renders loaded empty content verbatim when a skill is selected", () => {
    const preview = resolveSkillPreviewContent({
      skillContentLoading: false,
      skillsLoading: false,
      selectedSkillId: "user_agents_skills::empty-skill",
      skillContentLoadStatus: "loaded",
      selectedSkillContent: "",
    });

    expect(preview).toBe("");
  });

  it("shows the selection placeholder when no skill is selected", () => {
    const preview = resolveSkillPreviewContent({
      skillContentLoading: false,
      skillsLoading: false,
      selectedSkillId: null,
      skillContentLoadStatus: "idle",
      selectedSkillContent: "",
    });

    expect(preview).toBe("Select a skill to preview SKILL.md.");
  });
});
