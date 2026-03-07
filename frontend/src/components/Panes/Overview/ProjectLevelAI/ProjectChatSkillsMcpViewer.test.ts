import { createAgentRun } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import {
  areAgentNativeSlashCommandMapsEqual,
  filterAgentNativeSlashCommandsByEngineId,
  parseAgentNativeSlashCommandsStorage,
  resolveAgentNativeSlashCommandsByEngineId,
  resolveCustomSlashDraftByProjectConfigIdUpdate,
  resolveSkillMarkdownRawDraftBySkillIdHydration,
  resolveSkillMarkdownRawDraftBySkillIdUpdate,
  resolveSkillPreviewContent,
  shouldPollSlashCommandAgentRuns,
} from "./ProjectChatSkillsMcpViewer";

describe("parseAgentNativeSlashCommandsStorage", () => {
  it("fails closed on legacy engine-scoped storage entries", () => {
    const parsed = parseAgentNativeSlashCommandsStorage(
      JSON.stringify({
        "engine-1": {
          commands: ["/legacy"],
          status: "available",
          statusDetail: null,
        },
      }),
    );

    expect(parsed).toEqual({});
  });

  it("hydrates canonical project-scoped storage entries", () => {
    const parsed = parseAgentNativeSlashCommandsStorage(
      JSON.stringify({
        "project-a": {
          "engine-1": {
            commands: [" /help ", "/status"],
            status: "available",
            statusDetail: "Loaded from run metadata",
          },
        },
      }),
    );

    expect(parsed).toEqual({
      "project-a": {
        "engine-1": {
          commands: ["/help", "/status"],
          status: "available",
          statusDetail: "Loaded from run metadata",
        },
      },
    });
  });
});

describe("resolveAgentNativeSlashCommandsByEngineId", () => {
  it("keeps only authoritative entries for the active project and engine set", () => {
    const resolved = resolveAgentNativeSlashCommandsByEngineId({
      runs: [
        createAgentRun({
          id: "run-foreign-project",
          inputs: {
            projectConfigId: "project-a",
          },
          outputs: {
            metadata: {
              engineConfigId: "engine-foreign",
              agentNativeSlashCommands: ["/ship"],
            },
          },
        }),
        createAgentRun({
          id: "run-active-engine",
          inputs: {
            projectConfigId: "project-b",
          },
          outputs: {
            metadata: {
              engineConfigId: "engine-live",
              agentNativeSlashCommands: ["/help"],
            },
          },
        }),
        createAgentRun({
          id: "run-deleted-engine",
          inputs: {
            projectConfigId: "project-b",
          },
          outputs: {
            metadata: {
              engineConfigId: "engine-deleted",
              agentNativeSlashCommands: ["/deploy"],
            },
          },
        }),
      ],
      projectConfigId: "project-b",
      engineConfigIds: ["engine-live"],
    });

    expect(resolved).toEqual({
      "engine-live": {
        commands: ["/help"],
        status: "available",
        statusDetail: null,
      },
    });
  });

  it("keeps the newest run per engine when runs arrive in reverse chronological order", () => {
    const resolved = resolveAgentNativeSlashCommandsByEngineId({
      runs: [
        createAgentRun({
          id: "run-older",
          startedAt: "2026-02-01T00:00:00Z",
          finishedAt: "2026-02-01T00:00:01Z",
          inputs: {
            projectConfigId: "project-b",
          },
          outputs: {
            metadata: {
              engineConfigId: "engine-live",
              agentNativeSlashCommands: ["/old"],
            },
          },
        }),
        createAgentRun({
          id: "run-newer",
          startedAt: "2026-02-02T00:00:00Z",
          finishedAt: "2026-02-02T00:00:01Z",
          inputs: {
            projectConfigId: "project-b",
          },
          outputs: {
            metadata: {
              engineConfigId: "engine-live",
              agentNativeSlashCommands: ["/new"],
            },
          },
        }),
      ],
      projectConfigId: "project-b",
      engineConfigIds: ["engine-live"],
    });

    expect(resolved).toEqual({
      "engine-live": {
        commands: ["/new"],
        status: "available",
        statusDetail: null,
      },
    });
  });

  it("lets a newer none status clear stale commands from older runs", () => {
    const resolved = resolveAgentNativeSlashCommandsByEngineId({
      runs: [
        createAgentRun({
          id: "run-older",
          startedAt: "2026-02-01T00:00:00Z",
          finishedAt: "2026-02-01T00:00:01Z",
          inputs: {
            projectConfigId: "project-b",
          },
          outputs: {
            metadata: {
              engineConfigId: "engine-live",
              agentNativeSlashCommands: ["/deploy"],
            },
          },
        }),
        createAgentRun({
          id: "run-newer",
          startedAt: "2026-02-02T00:00:00Z",
          finishedAt: "2026-02-02T00:00:01Z",
          inputs: {
            projectConfigId: "project-b",
          },
          outputs: {
            metadata: {
              engineConfigId: "engine-live",
              agentNativeSlashCommands: [],
              agentNativeSlashCommandsStatus: "none",
            },
          },
        }),
      ],
      projectConfigId: "project-b",
      engineConfigIds: ["engine-live"],
    });

    expect(resolved).toEqual({
      "engine-live": {
        commands: [],
        status: "none",
        statusDetail: null,
      },
    });
  });
});

describe("filterAgentNativeSlashCommandsByEngineId", () => {
  it("drops cached entries for engines that are no longer configured", () => {
    const filtered = filterAgentNativeSlashCommandsByEngineId({
      entries: {
        "engine-deleted": {
          commands: ["/ship"],
          status: "available",
          statusDetail: null,
        },
        "engine-live": {
          commands: ["/help"],
          status: "available",
          statusDetail: null,
        },
      },
      engineConfigIds: ["engine-live"],
    });

    expect(filtered).toEqual({
      "engine-live": {
        commands: ["/help"],
        status: "available",
        statusDetail: null,
      },
    });
  });
});

describe("areAgentNativeSlashCommandMapsEqual", () => {
  it("detects when authoritative native-command maps have been pruned", () => {
    expect(
      areAgentNativeSlashCommandMapsEqual(
        {
          "engine-deleted": {
            commands: ["/ship"],
            status: "available",
            statusDetail: null,
          },
          "engine-live": {
            commands: ["/help"],
            status: "available",
            statusDetail: null,
          },
        },
        {
          "engine-live": {
            commands: ["/help"],
            status: "available",
            statusDetail: null,
          },
        },
      ),
    ).toBe(false);
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

describe("resolveSkillMarkdownRawDraftBySkillIdHydration", () => {
  it("hydrates a draft for a newly loaded skill", () => {
    const hydrated = resolveSkillMarkdownRawDraftBySkillIdHydration({
      skillMarkdownDraftStateBySkillId: {},
      skillId: "user_agents_skills::triage",
      skillContent: "# Triage",
    });

    expect(hydrated).toEqual({
      "user_agents_skills::triage": {
        draft: "# Triage",
        loadedContent: "# Triage",
      },
    });
  });

  it("updates clean drafts on refresh but preserves dirty drafts", () => {
    const refreshedClean = resolveSkillMarkdownRawDraftBySkillIdHydration({
      skillMarkdownDraftStateBySkillId: {
        "user_agents_skills::triage": {
          draft: "# Triage",
          loadedContent: "# Triage",
        },
      },
      skillId: "user_agents_skills::triage",
      skillContent: "# Server copy",
    });

    expect(refreshedClean).toEqual({
      "user_agents_skills::triage": {
        draft: "# Server copy",
        loadedContent: "# Server copy",
      },
    });

    expect(
      resolveSkillMarkdownRawDraftBySkillIdHydration({
        skillMarkdownDraftStateBySkillId: {
          "user_agents_skills::triage": {
            draft: "# Local edits",
            loadedContent: "# Triage",
          },
        },
        skillId: "user_agents_skills::triage",
        skillContent: "# Server copy",
      }),
    ).toEqual({
      "user_agents_skills::triage": {
        draft: "# Local edits",
        loadedContent: "# Server copy",
      },
    });
  });
});

describe("resolveSkillMarkdownRawDraftBySkillIdUpdate", () => {
  it("keeps independent drafts for each skill id", () => {
    const next = resolveSkillMarkdownRawDraftBySkillIdUpdate({
      skillMarkdownDraftStateBySkillId: {
        "user_agents_skills::triage": {
          draft: "# local edits",
          loadedContent: "# Triage",
        },
      },
      skillId: "workspace_agents_skills::release",
      nextRawDraft: "# release notes",
    });

    expect(next).toEqual({
      "user_agents_skills::triage": {
        draft: "# local edits",
        loadedContent: "# Triage",
      },
      "workspace_agents_skills::release": {
        draft: "# release notes",
        loadedContent: "# release notes",
      },
    });
  });
});

describe("resolveCustomSlashDraftByProjectConfigIdUpdate", () => {
  it("isolates new custom slash-command drafts by project id", () => {
    const next = resolveCustomSlashDraftByProjectConfigIdUpdate({
      customSlashDraftByProjectConfigId: {
        "project-a": {
          command: "/triage",
          prompt: "Summarize open bugs.",
        },
      },
      projectConfigId: "project-b",
      nextDraft: {
        command: "/ship",
        prompt: "Prepare release notes.",
      },
    });

    expect(next).toEqual({
      "project-a": {
        command: "/triage",
        prompt: "Summarize open bugs.",
      },
      "project-b": {
        command: "/ship",
        prompt: "Prepare release notes.",
      },
    });
  });

  it("clears only the active project draft when both fields are emptied", () => {
    const next = resolveCustomSlashDraftByProjectConfigIdUpdate({
      customSlashDraftByProjectConfigId: {
        "project-a": {
          command: "/triage",
          prompt: "Summarize open bugs.",
        },
        "project-b": {
          command: "/ship",
          prompt: "Prepare release notes.",
        },
      },
      projectConfigId: "project-b",
      nextDraft: {
        command: "",
        prompt: "",
      },
    });

    expect(next).toEqual({
      "project-a": {
        command: "/triage",
        prompt: "Summarize open bugs.",
      },
    });
  });
});
