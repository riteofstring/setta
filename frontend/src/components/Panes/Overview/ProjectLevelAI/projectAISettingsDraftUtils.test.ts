import {
  ClaudeSettingsSourceEnum,
  ExternalAgentRunModeEnum,
  ExternalAgentToolTypeEnum,
  ExternalAgentWorkingDirStrategyEnum,
  PromptFormatEnum,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  buildAgentProfileDraft,
  buildExternalAgentConfigDraft,
  buildPromptTemplateDraft,
  normalizeOptionalText,
  parseListInput,
  parseOpenCodePermission,
} from "./projectAISettingsDraftUtils";

describe("projectAISettingsDraftUtils", () => {
  it("builds agent profile drafts from persisted profile state", () => {
    expect(
      buildAgentProfileDraft({
        id: "agent-profile-1",
        name: "Reviewer",
        description: "Code review agent",
        systemPrompt: "Be strict",
        enableBackgroundSummaryFill: true,
        enableLlmChatTitles: false,
        engineConfigId: "engine-1",
        toolAllowlist: ["git_status", "grep"],
        memoryScope: "project",
      }),
    ).toEqual({
      name: "Reviewer",
      description: "Code review agent",
      systemPrompt: "Be strict",
      enableBackgroundSummaryFill: true,
      enableLlmChatTitles: false,
      engineConfigId: "engine-1",
      toolAllowlistText: "git_status\ngrep",
      memoryScope: "project",
    });
  });

  it("fills default Claude settings sources when an external config omits them", () => {
    expect(
      buildExternalAgentConfigDraft({
        id: "external-agent-1",
        name: "Claude",
        description: null,
        toolType: ExternalAgentToolTypeEnum.claude_code,
        runMode: ExternalAgentRunModeEnum.sdk,
        commandPath: null,
        baseUrl: null,
        defaultModel: null,
        sandboxPolicy: null,
        approvalPolicy: null,
        settingsMode: null,
        settingsSources: null,
        settingsFilePath: null,
        settingsAllowSettaEdits: null,
        settingsManagedBlock: null,
        envVarWhitelist: [],
        workingDirStrategy: ExternalAgentWorkingDirStrategyEnum.project_root,
        workingDir: null,
      }),
    ).toMatchObject({
      settingsSources: [
        ClaudeSettingsSourceEnum.project,
        ClaudeSettingsSourceEnum.local,
      ],
      settingsAllowSettaEdits: true,
    });
  });

  it("builds prompt template drafts with formatted JSON payloads", () => {
    expect(
      buildPromptTemplateDraft({
        id: "prompt-template-1",
        name: "Summarize",
        description: "Summarize a section",
        template: "Hello {{ section }}",
        format: PromptFormatEnum.Jinja,
        inputSchema: { section: { type: "string" } },
        metadata: { category: "summary" },
      }),
    ).toEqual({
      name: "Summarize",
      description: "Summarize a section",
      template: "Hello {{ section }}",
      format: PromptFormatEnum.Jinja,
      inputSchemaText: JSON.stringify({ section: { type: "string" } }, null, 2),
      metadataText: JSON.stringify({ category: "summary" }, null, 2),
    });
  });

  it("parses tool allowlists from newline and comma separated text", () => {
    expect(parseListInput("git_status,\n grep \n\nrun")).toEqual([
      "git_status",
      "grep",
      "run",
    ]);
  });

  it("normalizes blank optional strings to null", () => {
    expect(normalizeOptionalText("   ")).toBeNull();
    expect(normalizeOptionalText(" value ")).toBe("value");
  });

  it("rejects invalid nested OpenCode permission values", () => {
    expect(parseOpenCodePermission('{"shell":{"allow":["bad"]}}')).toEqual({
      value: null,
      error: "Permission objects must map to string values.",
    });
  });
});
