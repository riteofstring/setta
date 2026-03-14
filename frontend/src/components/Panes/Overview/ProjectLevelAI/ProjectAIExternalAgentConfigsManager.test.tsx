/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useAIStore } from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import {
  ExternalAgentRunModeEnum,
  ExternalAgentSettingsModeEnum,
  ExternalAgentToolTypeEnum,
  type ExternalAgentConfig,
} from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ProjectAIExternalAgentConfigsManager } from "./ProjectAIExternalAgentConfigsManager";

function createExternalAgentConfig(
  overrides: Partial<ExternalAgentConfig> = {},
): ExternalAgentConfig {
  return {
    id: "external-agent-1",
    name: "Claude Engine",
    description: "",
    toolType: ExternalAgentToolTypeEnum.claude_code,
    pluginAdapterId: null,
    runMode: ExternalAgentRunModeEnum.sdk,
    commandPath: null,
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
    workingDirStrategy: "project_root",
    workingDir: null,
    codexSkipGitRepoCheck: null,
    ...overrides,
  };
}

describe("ProjectAIExternalAgentConfigsManager", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetProjectStores();
    useAIStore.setState({
      externalAgentConfigs: [],
      apiKeys: {},
      allLLMConfigs: { configs: {} },
      promptTemplates: [],
      transcriptionProfiles: [],
      agentProfiles: [],
    });
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
    document.body.innerHTML = "";
  });

  it("hydrates persisted OpenCode JSON fields into the extracted manager form", async () => {
    useAIStore.setState({
      externalAgentConfigs: [
        createExternalAgentConfig({
          id: "external-agent-opencode",
          name: "OpenCode",
          toolType: ExternalAgentToolTypeEnum.opencode,
          settingsManagedBlock: {
            opencode: {
              permission: {
                shell: "allow",
              },
              mcp: {
                server: {
                  command: "node",
                },
              },
              model: null,
            },
          },
        }),
      ],
    });

    await act(async () => {
      root.render(<ProjectAIExternalAgentConfigsManager canEdit={true} />);
    });

    // This verifies the extracted manager still rehydrates persisted OpenCode JSON state.
    const textareas = Array.from(
      host.querySelectorAll("textarea"),
    ) as Array<HTMLTextAreaElement>;
    expect(host.textContent).toContain("OpenCode Permission (JSON)");
    expect(textareas[0].value).toContain('"shell": "allow"');
    expect(textareas[1].value).toContain('"server"');
  });

  it("creates a writable draft when starting a new external agent config", async () => {
    await act(async () => {
      root.render(<ProjectAIExternalAgentConfigsManager canEdit={true} />);
    });

    expect(host.textContent).toContain("No external agents configured.");
    expect(host.textContent).toContain(
      "Select an external agent config to edit.",
    );

    const createButton = host.querySelector("button");
    expect(createButton).not.toBeNull();

    await act(async () => {
      createButton?.dispatchEvent(
        new MouseEvent("click", { bubbles: true, cancelable: true }),
      );
    });

    // This verifies the manager can still create a fresh editable draft without persisted configs.
    expect(host.textContent).toContain("Creating a new external agent config.");
    expect(host.querySelectorAll("input").length).toBeGreaterThan(0);
  });
});
