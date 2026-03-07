import { createAgentRun } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import {
  canCreateCustomSkill,
  isCustomSlashNamespaceAuthorityReady,
  resolveCanAddCustomSlashCommand,
  resolveCustomSlashDraftByProjectConfigIdUpdate,
  resolveSelectedSkillViewStateAfterUpsertedSkillResponse,
  resolveSkillMarkdownRawDraftBySkillIdHydration,
  resolveSkillMarkdownRawDraftBySkillIdReplace,
  resolveSkillMarkdownRawDraftBySkillIdUpdate,
  resolveSkillPreviewContent,
  shouldPollSlashCommandAgentRuns,
  upsertAppGenSkillEntry,
} from "./ProjectChatSkillsMcpViewer";
import {
  areAgentNativeSlashCommandMapsEqual,
  filterAgentNativeSlashCommandsByEngineId,
  parseAgentNativeSlashCommandsStorage,
  resolveAgentNativeSlashCommandsByEngineId,
} from "./projectChatSkillsMcpViewerUtils";

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

describe("upsertAppGenSkillEntry", () => {
  it("keeps newly upserted skills sorted like the authoritative backend list", () => {
    const next = upsertAppGenSkillEntry(
      [
        {
          skillId: "user_agents_skills::beta",
          name: "beta",
          rootLabel: "User ~/.agents/skills",
          rootPath: "/home/.agents/skills",
          relativePath: "beta",
          isEditable: true,
          editabilityReason: null,
          description: "",
        },
      ],
      {
        skillId: "user_agents_skills::alpha",
        name: "alpha",
        rootLabel: "User ~/.agents/skills",
        rootPath: "/home/.agents/skills",
        relativePath: "alpha",
        isEditable: true,
        editabilityReason: null,
        description: "",
      },
    );

    expect(next.map((skill) => skill.skillId)).toEqual([
      "user_agents_skills::alpha",
      "user_agents_skills::beta",
    ]);
  });

  it("replaces existing skill rows without duplicating the selected skill", () => {
    const next = upsertAppGenSkillEntry(
      [
        {
          skillId: "user_agents_skills::triage",
          name: "triage",
          rootLabel: "User ~/.agents/skills",
          rootPath: "/home/.agents/skills",
          relativePath: "triage",
          isEditable: true,
          editabilityReason: null,
          description: "Old description",
        },
      ],
      {
        skillId: "user_agents_skills::triage",
        name: "triage",
        rootLabel: "User ~/.agents/skills",
        rootPath: "/home/.agents/skills",
        relativePath: "triage",
        isEditable: true,
        editabilityReason: null,
        description: "Updated description",
      },
    );

    expect(next).toHaveLength(1);
    expect(next[0]?.description).toBe("Updated description");
  });
});

describe("resolveSelectedSkillViewStateAfterUpsertedSkillResponse", () => {
  const updatedAlphaSkill = {
    skillId: "user_agents_skills::alpha-custom",
    name: "alpha-custom",
    rootLabel: "User ~/.agents/skills",
    rootPath: "/home/.agents/skills",
    relativePath: "alpha-custom",
    isEditable: true,
    editabilityReason: null,
    description: "Alpha custom skill",
  };
  const updatedAlphaContent = {
    skillId: "user_agents_skills::alpha-custom",
    content: "# alpha-custom\n\nAlpha saved update",
    truncated: false,
    originalSizeBytes: "# alpha-custom\n\nAlpha saved update".length,
  };

  it("ignores stale save responses after the user switches to another skill", () => {
    const nextSelectedState =
      resolveSelectedSkillViewStateAfterUpsertedSkillResponse({
        currentSelectedSkillId: "user_agents_skills::beta-custom",
        requestSkillId: "user_agents_skills::alpha-custom",
        selectUpdatedSkill: false,
        skill: updatedAlphaSkill,
        skillContent: updatedAlphaContent,
      });

    expect(nextSelectedState).toBeNull();
  });

  it("keeps same-skill save responses authoritative for the active editor", () => {
    const nextSelectedState =
      resolveSelectedSkillViewStateAfterUpsertedSkillResponse({
        currentSelectedSkillId: "user_agents_skills::alpha-custom",
        requestSkillId: "user_agents_skills::alpha-custom",
        selectUpdatedSkill: false,
        skill: updatedAlphaSkill,
        skillContent: updatedAlphaContent,
      });

    expect(nextSelectedState).toEqual({
      selectedSkillId: "user_agents_skills::alpha-custom",
      selectedSkillContent: "# alpha-custom\n\nAlpha saved update",
      selectedSkillContentTruncated: false,
      selectedSkillOriginalSizeBytes: "# alpha-custom\n\nAlpha saved update"
        .length,
    });
  });

  it("lets create flows explicitly select the created skill", () => {
    const nextSelectedState =
      resolveSelectedSkillViewStateAfterUpsertedSkillResponse({
        currentSelectedSkillId: "user_agents_skills::beta-custom",
        requestSkillId: null,
        selectUpdatedSkill: true,
        skill: updatedAlphaSkill,
        skillContent: updatedAlphaContent,
      });

    expect(nextSelectedState?.selectedSkillId).toBe(
      "user_agents_skills::alpha-custom",
    );
  });
});

describe("resolveSkillMarkdownRawDraftBySkillIdReplace", () => {
  it("resets draft and loaded content together after a successful save", () => {
    const next = resolveSkillMarkdownRawDraftBySkillIdReplace({
      skillMarkdownDraftStateBySkillId: {
        "user_agents_skills::alpha-custom": {
          draft: "# alpha-custom\n\nLocal edits still pending",
          loadedContent: "# alpha-custom\n\nAlpha initial body",
        },
      },
      skillId: "user_agents_skills::alpha-custom",
      nextRawDraft: "# alpha-custom\n\nAlpha saved update",
    });

    expect(next).toEqual({
      "user_agents_skills::alpha-custom": {
        draft: "# alpha-custom\n\nAlpha saved update",
        loadedContent: "# alpha-custom\n\nAlpha saved update",
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

describe("canCreateCustomSkill", () => {
  it("requires a current backend root before enabling create", () => {
    expect(
      canCreateCustomSkill({
        customSkillCreateInFlight: false,
        customSkillCreateRootPath: null,
        newCustomSkillRelativePath: "new-skill",
      }),
    ).toBe(false);

    expect(
      canCreateCustomSkill({
        customSkillCreateInFlight: false,
        customSkillCreateRootPath: "/home/.agents/skills",
        newCustomSkillRelativePath: "new-skill",
      }),
    ).toBe(true);
  });
});

describe("isCustomSlashNamespaceAuthorityReady", () => {
  it("fails closed until engine configs finish loading", () => {
    expect(
      isCustomSlashNamespaceAuthorityReady({
        agentRunsAuthorityState: "ready",
        engineConfigsInitialLoadComplete: false,
        slashCommandsByEngine: [],
      }),
    ).toBe(false);
  });

  it("fails closed for external-agent projects until native authority is ready", () => {
    expect(
      isCustomSlashNamespaceAuthorityReady({
        agentRunsAuthorityState: "loading",
        engineConfigsInitialLoadComplete: true,
        slashCommandsByEngine: [{ engineType: "external_agent" }],
      }),
    ).toBe(false);
    expect(
      isCustomSlashNamespaceAuthorityReady({
        agentRunsAuthorityState: "ready",
        engineConfigsInitialLoadComplete: true,
        slashCommandsByEngine: [{ engineType: "external_agent" }],
      }),
    ).toBe(true);
  });

  it("keeps custom slash creation available when no external agent engines exist", () => {
    expect(
      isCustomSlashNamespaceAuthorityReady({
        agentRunsAuthorityState: "loading",
        engineConfigsInitialLoadComplete: true,
        slashCommandsByEngine: [{ engineType: "setta_llm" }],
      }),
    ).toBe(true);
  });
});

describe("resolveCanAddCustomSlashCommand", () => {
  it("blocks add even for unique commands while namespace authority is unresolved", () => {
    expect(
      resolveCanAddCustomSlashCommand({
        customSlashCommandTokens: new Set<string>(),
        namespaceAuthorityReady: false,
        newCustomSlashPrompt: "Summarize project status.",
        normalizedNewCustomSlashCommand: "/project-status",
        reservedSlashCommandTokens: new Set<string>(),
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
