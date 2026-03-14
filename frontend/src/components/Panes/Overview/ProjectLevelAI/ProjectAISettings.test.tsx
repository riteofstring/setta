/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  useAIStore,
  useProjectState,
  useSettings,
  useShareSession,
} from "state/definitions";
import { resetProjectStores } from "state/utils";
import "testUtils/reactRefreshPreamble";
import { createSettingsState } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectAISettings } from "./ProjectAISettings";

vi.mock("./useHydrateAgenticState", () => ({
  useHydrateAgenticState: () => {},
}));

vi.mock("./ProjectLLMSettings", () => ({
  ProjectLLMSettings: () => (
    <div data-testid="project-llm-settings">Mock LLM Settings</div>
  ),
}));

describe("ProjectAISettings", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    resetProjectStores();
    useProjectState.setState((state) => {
      state.projectConfig.id = "project-config-1";
    });
    useShareSession.setState({ isDeploymentMode: false, sharePolicy: null });
    useSettings.setState(createSettingsState(useSettings.getState()));
    useAIStore.setState({
      agentProfiles: [],
      promptTemplates: [],
      transcriptionProfiles: [],
      externalAgentConfigs: [],
      apiKeys: {},
      allLLMConfigs: { configs: {} },
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

  it("renders the Project AI accordion sections in edit mode", async () => {
    await act(async () => {
      root.render(<ProjectAISettings />);
    });

    expect(host.textContent).toContain("Tune project-wide AI behavior.");
    expect(host.textContent).toContain("LLM API Keys");
    expect(host.textContent).toContain("Guardrails");
    expect(host.textContent).toContain("Agent Profiles");
    expect(host.textContent).toContain("Transcription Profiles");
    expect(host.textContent).toContain("Prompt Templates");
    expect(host.textContent).toContain("External Agents");
  });

  it("shows the share-mode notice when deployment mode disables LLM settings", async () => {
    useShareSession.setState({ isDeploymentMode: true });

    await act(async () => {
      root.render(<ProjectAISettings />);
    });

    expect(host.textContent).toContain(
      "LLM settings are unavailable in share mode.",
    );
  });
});
