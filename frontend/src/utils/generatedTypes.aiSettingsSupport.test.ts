import {
  ClaudeSettingsSourceEnum,
  ExternalAgentRunModeEnum,
  ExternalAgentSettingsModeEnum,
  ExternalAgentToolTypeEnum,
  ExternalAgentWorkingDirStrategyEnum,
  MCPServerTransportEnum,
  PromptFormatEnum,
  createAllLLMConfigs,
  createExternalAgentConfig,
  createExternalAgentPreflightStatus,
  createLLMConfig,
  createPromptTemplate,
} from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

describe("generated AI settings support", () => {
  it("creates canonical llm config helpers for config and MCP server maps", () => {
    const allLLMConfigs = createAllLLMConfigs({
      configs: {
        "openai-main": createLLMConfig({
          id: "openai-main",
          model: "gpt-5",
          provider: "openai",
          api_key_env: "OPENAI_API_KEY",
          mcpServerIds: ["workspace-docs"],
          temporary: false,
        }),
      },
      mcpServers: {
        "workspace-docs": {
          transport: MCPServerTransportEnum.stdio,
          command: "node",
          args: ["./mcp-server.js"],
        },
      },
      defaultMcpServerIds: ["workspace-docs"],
      default_config_id: "openai-main",
      codexMcpImportedAt: null,
    });

    expect(allLLMConfigs.configs["openai-main"]?.api_key_env).toBe(
      "OPENAI_API_KEY",
    );
    expect(allLLMConfigs.mcpServers["workspace-docs"]?.transport).toBe(
      MCPServerTransportEnum.stdio,
    );
    expect(allLLMConfigs.default_config_id).toBe("openai-main");
  });

  it("creates external agent config and preflight helpers with canonical enums", () => {
    const config = createExternalAgentConfig({
      id: "codex-agent",
      name: "Codex Agent",
      description: "",
      toolType: ExternalAgentToolTypeEnum.codex,
      runMode: ExternalAgentRunModeEnum.app_server,
      settingsMode: ExternalAgentSettingsModeEnum.managed_local,
      settingsSources: [ClaudeSettingsSourceEnum.project],
      settingsAllowSettaEdits: true,
      envVarWhitelist: ["OPENAI_API_KEY"],
      workingDirStrategy: ExternalAgentWorkingDirStrategyEnum.project_root,
    });
    const status = createExternalAgentPreflightStatus({
      configId: "codex-agent",
      name: "Codex Agent",
      toolType: ExternalAgentToolTypeEnum.codex,
      runMode: ExternalAgentRunModeEnum.app_server,
      supported: true,
      available: true,
      issues: [],
      envVars: {
        present: ["OPENAI_API_KEY"],
        missing: [],
      },
    });

    expect(config.toolType).toBe(ExternalAgentToolTypeEnum.codex);
    expect(config.runMode).toBe(ExternalAgentRunModeEnum.app_server);
    expect(config.settingsMode).toBe(
      ExternalAgentSettingsModeEnum.managed_local,
    );
    expect(config.workingDirStrategy).toBe(
      ExternalAgentWorkingDirStrategyEnum.project_root,
    );
    expect(status.available).toBe(true);
    expect(status.envVars.present).toEqual(["OPENAI_API_KEY"]);
  });

  it("creates prompt templates with the canonical prompt format enum", () => {
    const promptTemplate = createPromptTemplate({
      id: "app-json",
      name: "App JSON",
      description: "Build an app from JSON.",
      template: "Return valid app JSON.",
      format: PromptFormatEnum.Jinja,
      inputSchema: {},
      metadata: { category: "app" },
    });

    expect(promptTemplate.format).toBe(PromptFormatEnum.Jinja);
    expect(promptTemplate.metadata).toEqual({ category: "app" });
  });
});
