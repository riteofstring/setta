import {
  ClaudeSettingsSourceEnum,
  ExternalAgentUIConfig,
  RunModeEnum,
  SettingsModeEnum,
  ToolTypeEnum,
  WorkingDirStrategyEnum,
  type ExternalAgentConfig,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  buildExternalAgentConfigDraft,
  buildExternalAgentConfigSavePayload,
  createExternalAgentConfigDraft,
  updateExternalAgentDraftField,
} from "./projectAISettingsExternalAgents";

describe("projectAISettingsExternalAgents", () => {
  it("seeds new drafts with the canonical Claude defaults", () => {
    const draft = createExternalAgentConfigDraft(ToolTypeEnum.codex);

    expect(draft.runMode).toBe(RunModeEnum.sdk);
    expect(draft.settingsSources).toEqual([
      ClaudeSettingsSourceEnum.project,
      ClaudeSettingsSourceEnum.local,
    ]);
    expect(draft.claudeAskText).toBe(
      ExternalAgentUIConfig.defaultClaudeAskRules.join("\n"),
    );
  });

  it("builds Claude drafts from config data without restating fallback defaults", () => {
    const config: ExternalAgentConfig = {
      id: "agent-1",
      name: "Claude",
      description: "assistant",
      toolType: ToolTypeEnum.claude_code,
      runMode: RunModeEnum.sdk,
      envVarWhitelist: ["OPENAI_API_KEY"],
      settingsAllowSettaEdits: false,
      settingsMode: SettingsModeEnum.managed_local,
      settingsSources: null,
      settingsManagedBlock: {
        claude: {
          permissions: {
            allow: ["Read"],
            ask: ["Write"],
            deny: ["Delete"],
          },
        },
      },
      workingDirStrategy: WorkingDirStrategyEnum.project_root,
    };

    const draft = buildExternalAgentConfigDraft(config);

    expect(draft.settingsSources).toEqual([
      ClaudeSettingsSourceEnum.project,
      ClaudeSettingsSourceEnum.local,
    ]);
    expect(draft.claudeAllowText).toBe("Read");
    expect(draft.claudeAskText).toBe("Write");
    expect(draft.claudeDenyText).toBe("Delete");
    expect(draft.envVarWhitelistText).toBe("OPENAI_API_KEY");
  });

  it("omits Claude-only save fields for non-Claude tools while preserving existing managed settings", () => {
    const existing: ExternalAgentConfig = {
      id: "agent-2",
      name: "Codex",
      description: "assistant",
      toolType: ToolTypeEnum.codex,
      runMode: RunModeEnum.app_server,
      envVarWhitelist: null,
      settingsAllowSettaEdits: true,
      settingsMode: SettingsModeEnum.managed_local,
      settingsSources: null,
      settingsManagedBlock: {
        claude: {
          permissions: {
            allow: ["Persist"],
            ask: ["Persist"],
            deny: [],
          },
        },
      },
      workingDirStrategy: WorkingDirStrategyEnum.project_root,
    };

    const payload = buildExternalAgentConfigSavePayload(
      createExternalAgentConfigDraft(ToolTypeEnum.codex),
      existing,
    );

    expect(payload.settingsSources).toBeNull();
    expect(payload.settingsManagedBlock).toEqual(existing.settingsManagedBlock);
  });

  it("keeps run mode aligned with the selected tool type", () => {
    const codexDraft = updateExternalAgentDraftField(
      createExternalAgentConfigDraft(ToolTypeEnum.codex),
      "toolType",
      ToolTypeEnum.codex,
    );
    const claudeDraft = updateExternalAgentDraftField(
      {
        ...createExternalAgentConfigDraft(ToolTypeEnum.codex),
        runMode: RunModeEnum.app_server,
      },
      "toolType",
      ToolTypeEnum.claude_code,
    );

    expect(codexDraft.runMode).toBe(RunModeEnum.app_server);
    expect(claudeDraft.runMode).toBe(RunModeEnum.sdk);
  });
});
