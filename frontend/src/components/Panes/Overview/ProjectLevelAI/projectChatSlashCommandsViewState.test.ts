import { describe, expect, it } from "vitest";

import {
  isCustomSlashNamespaceAuthorityReady,
  resolveCanAddCustomSlashCommand,
  resolveCustomSlashDraftByProjectConfigIdUpdate,
} from "./projectChatSlashCommandsViewState";

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

describe("resolveCustomSlashDraftByProjectConfigIdUpdate", () => {
  it("isolates new custom slash-command drafts by project id", () => {
    const next = resolveCustomSlashDraftByProjectConfigIdUpdate({
      customSlashDraftByProjectConfigId: {
        "project-a": {
          command: "/triage",
          prompt: "Summarize open bugs.",
          appGenerationMode: null,
        },
      },
      projectConfigId: "project-b",
      nextDraft: {
        command: "/ship",
        prompt: "Prepare release notes.",
        appGenerationMode: null,
      },
    });

    expect(next).toEqual({
      "project-a": {
        command: "/triage",
        prompt: "Summarize open bugs.",
        appGenerationMode: null,
      },
      "project-b": {
        command: "/ship",
        prompt: "Prepare release notes.",
        appGenerationMode: null,
      },
    });
  });

  it("keeps a draft when only the submission mode changes", () => {
    const next = resolveCustomSlashDraftByProjectConfigIdUpdate({
      customSlashDraftByProjectConfigId: {
        "project-a": {
          command: "/wireframe",
          prompt: "Create dashboard.",
          appGenerationMode: null,
        },
      },
      projectConfigId: "project-a",
      nextDraft: {
        command: "/wireframe",
        prompt: "Create dashboard.",
        appGenerationMode: "json_render",
      },
    });

    expect(next).toEqual({
      "project-a": {
        command: "/wireframe",
        prompt: "Create dashboard.",
        appGenerationMode: "json_render",
      },
    });
  });

  it("keeps a draft while a mode-only selection is still in progress", () => {
    const next = resolveCustomSlashDraftByProjectConfigIdUpdate({
      customSlashDraftByProjectConfigId: {},
      projectConfigId: "project-a",
      nextDraft: {
        command: "",
        prompt: "",
        appGenerationMode: "json_render",
      },
    });

    expect(next).toEqual({
      "project-a": {
        command: "",
        prompt: "",
        appGenerationMode: "json_render",
      },
    });
  });

  it("keeps an existing command draft when the mode returns to plain chat", () => {
    const next = resolveCustomSlashDraftByProjectConfigIdUpdate({
      customSlashDraftByProjectConfigId: {
        "project-a": {
          command: "/wireframe",
          prompt: "Create dashboard.",
          appGenerationMode: "json_render",
        },
      },
      projectConfigId: "project-a",
      nextDraft: {
        command: "/wireframe",
        prompt: "Create dashboard.",
        appGenerationMode: null,
      },
    });

    expect(next).toEqual({
      "project-a": {
        command: "/wireframe",
        prompt: "Create dashboard.",
        appGenerationMode: null,
      },
    });
  });

  it("clears only the active project draft when both fields are emptied", () => {
    const next = resolveCustomSlashDraftByProjectConfigIdUpdate({
      customSlashDraftByProjectConfigId: {
        "project-a": {
          command: "/triage",
          prompt: "Summarize open bugs.",
          appGenerationMode: null,
        },
        "project-b": {
          command: "/ship",
          prompt: "Prepare release notes.",
          appGenerationMode: null,
        },
      },
      projectConfigId: "project-b",
      nextDraft: {
        command: "",
        prompt: "",
        appGenerationMode: null,
      },
    });

    expect(next).toEqual({
      "project-a": {
        command: "/triage",
        prompt: "Summarize open bugs.",
        appGenerationMode: null,
      },
    });
  });
});
