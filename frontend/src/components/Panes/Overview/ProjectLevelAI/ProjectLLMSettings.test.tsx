/* @vitest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import "testUtils/reactRefreshPreamble";
import { type AllConfigs } from "utils/generatedTypes";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectLLMSettings } from "./ProjectLLMSettings";

const mockActions = vi.hoisted(() => ({
  mutateAndSaveLLMApiKeys: vi.fn(),
}));

const mockAIState = vi.hoisted(() => ({
  allLLMConfigs: null as AllConfigs | null,
  apiKeys: {} as Record<string, string>,
  apiKeysLoadError: null as string | null,
}));

vi.mock("components/Params/ParamUIs/PasswordInput", () => ({
  PasswordInput: (props: {
    id: string;
    className: string;
    value: string;
    onBlur?: () => void;
    onChange: (value: string) => void;
    onKeyDown?: (event: KeyboardEvent) => void;
    isDisabled: boolean;
  }) => (
    <input
      id={props.id}
      className={props.className}
      value={props.value}
      disabled={props.isDisabled}
      onBlur={props.onBlur}
      onChange={(event) =>
        props.onChange((event.target as HTMLInputElement).value)
      }
      onKeyDown={props.onKeyDown}
    />
  ),
}));

vi.mock("state/actions/ai", () => ({
  mutateAndSaveLLMApiKeys: mockActions.mutateAndSaveLLMApiKeys,
}));

vi.mock("state/definitions", () => ({
  useAIStore: (selector: (state: typeof mockAIState) => unknown) =>
    selector(mockAIState),
}));

vi.mock("./useHydrateLLMState", () => ({
  useHydrateLLMState: () => undefined,
}));

function buildConfig({
  id,
  provider,
  apiKeyEnv,
}: {
  id: string;
  provider: string;
  apiKeyEnv: string | null;
}): AllConfigs["configs"][string] {
  return {
    id,
    model: `${provider}-model`,
    provider,
    base_url: null,
    api_key_env: apiKeyEnv,
    other_params: null,
    mcpServerIds: null,
    temporary: false,
  };
}

describe("ProjectLLMSettings", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    mockActions.mutateAndSaveLLMApiKeys.mockReset();
    mockActions.mutateAndSaveLLMApiKeys.mockResolvedValue(undefined);
    mockAIState.allLLMConfigs = null;
    mockAIState.apiKeys = {};
    mockAIState.apiKeysLoadError = null;
  });

  afterEach(async () => {
    await act(async () => {
      root.unmount();
    });
    host.remove();
  });

  async function renderSettings() {
    await act(async () => {
      root.render(<ProjectLLMSettings />);
    });
  }

  async function setInputValue(selector: string, value: string) {
    const input = host.querySelector(selector) as HTMLInputElement | null;
    expect(input).not.toBeNull();
    await act(async () => {
      const valueSetter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      valueSetter?.call(input, value);
      input!.dispatchEvent(new Event("input", { bubbles: true }));
      input!.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  async function clickButton(selector: string) {
    const button = host.querySelector(selector) as HTMLButtonElement | null;
    expect(button).not.toBeNull();
    await act(async () => {
      button!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  it("renders config-referenced and manual keys through the live component surface", async () => {
    mockAIState.allLLMConfigs = {
      configs: {
        "anthropic-main": buildConfig({
          id: "anthropic-main",
          provider: "anthropic",
          apiKeyEnv: "ANTHROPIC_API_KEY",
        }),
        "anthropic-backup": buildConfig({
          id: "anthropic-backup",
          provider: "anthropic",
          apiKeyEnv: "ANTHROPIC_API_KEY",
        }),
      },
      mcpServers: {},
      defaultMcpServerIds: [],
      default_config_id: null,
    };
    mockAIState.apiKeys = {
      OPENAI_API_KEY: "openai-secret",
    };

    await renderSettings();

    const renderedText = host.textContent ?? "";
    expect(renderedText).toContain("ANTHROPIC_API_KEY");
    expect(renderedText).toContain("OPENAI_API_KEY");
    expect(renderedText.indexOf("ANTHROPIC_API_KEY")).toBeLessThan(
      renderedText.indexOf("OPENAI_API_KEY"),
    );

    const anthropicTrigger = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent?.includes("ANTHROPIC_API_KEY"),
    );
    expect(anthropicTrigger).toBeDefined();
    await act(async () => {
      anthropicTrigger!.dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });

    expect(host.textContent).toContain(
      "Used by: anthropic-main (anthropic), anthropic-backup (anthropic)",
    );
  });

  it("renders manual keys even when no llm config snapshot is loaded", async () => {
    mockAIState.apiKeys = {
      GEMINI_API_KEY: "gemini-secret",
    };

    await renderSettings();

    expect(host.textContent).toContain("GEMINI_API_KEY");
  });

  it("rejects whitespace-only values and trims added values before persistence", async () => {
    await renderSettings();

    await setInputValue("#project-llm-settings-new-api-key-value", "   \n\t  ");
    await clickButton('[data-testid="project-llm-settings-add-api-key"]');

    expect(host.textContent).toContain("Value is required.");
    expect(mockActions.mutateAndSaveLLMApiKeys).not.toHaveBeenCalled();

    await setInputValue(
      "#project-llm-settings-new-api-key-value",
      "  secret-value  ",
    );
    await clickButton('[data-testid="project-llm-settings-add-api-key"]');

    expect(mockActions.mutateAndSaveLLMApiKeys).toHaveBeenCalledTimes(1);
    const updateApiKeys =
      mockActions.mutateAndSaveLLMApiKeys.mock.calls[0]?.[0];
    expect(
      updateApiKeys({
        EXISTING_API_KEY: "keep",
      }),
    ).toEqual({
      EXISTING_API_KEY: "keep",
      OPENAI_API_KEY: "secret-value",
    });
  });
});
