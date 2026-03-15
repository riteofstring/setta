import {
  ClaudeSettingsSourceEnum,
  ExternalAgentRunModeEnum,
  ExternalAgentSettingsModeEnum,
  ExternalAgentToolTypeEnum,
  ExternalAgentWorkingDirStrategyEnum,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  buildExternalAgentConfigDraft,
  buildSettingsManagedBlock,
  parseOpenCodePermission,
  resolveExternalAgentRunModeForToolTypeChange,
  type ExternalAgentConfigDraft,
} from "./projectAISettingsExternalAgents";

function buildExternalAgentConfig(id: string, name: string) {
  return {
    id,
    name,
    description: "",
    toolType: ExternalAgentToolTypeEnum.codex,
    pluginAdapterId: null,
    runMode: ExternalAgentRunModeEnum.sdk,
    commandPath: "/usr/bin/codex",
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
  };
}

function buildExternalAgentDraft(): ExternalAgentConfigDraft {
  return {
    name: "Claude",
    description: "desc",
    toolType: ExternalAgentToolTypeEnum.claude_code,
    runMode: ExternalAgentRunModeEnum.sdk,
    commandPath: "/usr/bin/claude",
    baseUrl: "",
    defaultModel: "sonnet",
    sandboxPolicy: "",
    approvalPolicy: "",
    settingsMode: ExternalAgentSettingsModeEnum.managed_local,
    settingsSources: [ClaudeSettingsSourceEnum.project],
    settingsFilePath: "",
    settingsAllowSettaEdits: true,
    envVarWhitelistText: "OPENAI_API_KEY",
    workingDirStrategy: ExternalAgentWorkingDirStrategyEnum.project_root,
    workingDir: "",
    claudeAllowText: "Read\nWrite",
    claudeAskText: "Bash(git push:*)",
    claudeDenyText: "Bash(rm:*)",
    opencodePermissionText: "",
    opencodeMcpText: "",
  };
}

describe("resolveExternalAgentRunModeForToolTypeChange", () => {
  it("switches Codex drafts to app_server when they come from sdk mode", () => {
    expect(
      resolveExternalAgentRunModeForToolTypeChange({
        nextToolType: ExternalAgentToolTypeEnum.codex,
        currentRunMode: ExternalAgentRunModeEnum.sdk,
      }),
    ).toBe(ExternalAgentRunModeEnum.app_server);
  });

  it("switches non-Codex drafts back to sdk when they came from app_server", () => {
    expect(
      resolveExternalAgentRunModeForToolTypeChange({
        nextToolType: ExternalAgentToolTypeEnum.claude_code,
        currentRunMode: ExternalAgentRunModeEnum.app_server,
      }),
    ).toBe(ExternalAgentRunModeEnum.sdk);
  });
});

describe("buildExternalAgentConfigDraft", () => {
  it("supplies default Claude settings sources when the saved config omitted them", () => {
    const config = {
      ...buildExternalAgentConfig("claude-a", "Claude"),
      toolType: ExternalAgentToolTypeEnum.claude_code,
      settingsSources: null,
      settingsManagedBlock: {
        claude: {
          permissions: {
            allow: ["Read"],
            ask: ["Bash(git push:*)"],
            deny: ["Bash(rm:*)"],
          },
        },
      },
    };

    expect(buildExternalAgentConfigDraft(config).settingsSources).toEqual([
      ClaudeSettingsSourceEnum.project,
      ClaudeSettingsSourceEnum.local,
    ]);
  });
});

describe("buildSettingsManagedBlock", () => {
  it("merges Claude permissions into the managed block while preserving unrelated settings", () => {
    const existing = {
      ...buildExternalAgentConfig("config-a", "Claude"),
      settingsManagedBlock: {
        opencode: {
          permission: {
            edit: "ask",
          },
          mcp: { github: { enabled: true } },
          model: "gpt-4.1",
        },
      },
    };

    expect(
      buildSettingsManagedBlock(buildExternalAgentDraft(), existing),
    ).toEqual({
      opencode: {
        permission: {
          edit: "ask",
        },
        mcp: { github: { enabled: true } },
        model: "gpt-4.1",
      },
      claude: {
        permissions: {
          allow: ["Read", "Write"],
          ask: ["Bash(git push:*)"],
          deny: ["Bash(rm:*)"],
        },
      },
    });
  });
});

describe("parseOpenCodePermission", () => {
  it("accepts flat and nested string permission objects", () => {
    expect(
      parseOpenCodePermission(
        JSON.stringify({
          edit: "ask",
          web: {
            browse: "allow",
          },
        }),
      ),
    ).toEqual({
      value: {
        edit: "ask",
        web: {
          browse: "allow",
        },
      },
      error: null,
    });
  });

  it("rejects nested non-string permission values", () => {
    expect(
      parseOpenCodePermission(
        JSON.stringify({
          web: {
            browse: true,
          },
        }),
      ),
    ).toEqual({
      value: null,
      error: "Permission objects must map to string values.",
    });
  });
});
