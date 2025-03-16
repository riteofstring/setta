import { cleanup, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LLMSettingsModal } from "./LLMSettingsModal";

// Mock the aiService with provider-specific models
vi.mock("services/aiService", () => ({
  getAvailableModels: vi.fn().mockResolvedValue([
    { id: "gpt-4", name: "GPT-4", serviceId: "openai" },
    { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", serviceId: "openai" },
    { id: "claude-3-opus", name: "Claude 3 Opus", serviceId: "anthropic" },
    { id: "claude-3-sonnet", name: "Claude 3 Sonnet", serviceId: "anthropic" },
    { id: "llama-3", name: "Llama 3", serviceId: "together" },
  ]),
}));

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => (key in store ? store[key] : null)),
    setItem: vi.fn((key, value) => {
      store[key] = value.toString();
    }),
    removeItem: vi.fn((key) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();
Object.defineProperty(window, "localStorage", { value: localStorageMock });

// Mock window.alert
window.alert = vi.fn();

// Clean up after each test
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
  localStorageMock.clear();
});

describe("LLMSettingsModal Tests", () => {
  const onClose = vi.fn();

  beforeEach(() => {
    // Setup initial state
    localStorageMock.clear();
  });

  it("renders the modal with default services", () => {
    render(<LLMSettingsModal onClose={onClose} />);

    // Check for basic elements
    expect(screen.getByText("LLM API Keys")).toBeDefined();
    expect(screen.getByText("OpenAI")).toBeDefined();
    expect(screen.getByText("Anthropic")).toBeDefined();
    expect(screen.getByText("Save")).toBeDefined();
    expect(screen.getByText("Cancel")).toBeDefined();
  });

  it("allows adding a new LLM service", async () => {
    const user = userEvent.setup();
    render(<LLMSettingsModal onClose={onClose} />);

    // Fill in the form fields
    const idInput = screen.getByLabelText("Service ID");
    const labelInput = screen.getByLabelText("Service Label");
    // Use a more specific selector to get the API Key input in the "Add Custom LLM" section
    const apiKeyInput = screen.getByPlaceholderText("Enter API Key");

    await user.type(idInput, "test-service");
    await user.type(labelInput, "Test Service");
    await user.type(apiKeyInput, "test-api-key");

    // Click the Add Service button
    await user.click(screen.getByText("Add Service"));

    // Check if the new service is added to the list
    expect(screen.getByText("Test Service")).toBeDefined();
  });

  it("saves API keys to localStorage", async () => {
    const user = userEvent.setup();
    render(<LLMSettingsModal onClose={onClose} />);

    // Find an API key input for OpenAI - be more specific with the placeholder
    const openaiApiKeyInput = screen.getByPlaceholderText(
      "Enter OpenAI API Key",
    );

    // Enter an API key
    await user.type(openaiApiKeyInput, "test-openai-key-456");

    // Save the settings
    await user.click(screen.getByText("Save"));

    // Check localStorage was updated
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "llm_service_keys",
      expect.stringContaining("test-openai-key-456"),
    );

    // Check onClose was called
    expect(onClose).toHaveBeenCalled();
  });

  it("loads existing API keys from localStorage", async () => {
    // Setup localStorage with some existing keys
    const existingKeys = {
      openai: "existing-openai-key",
      anthropic: "existing-anthropic-key",
    };
    localStorageMock.setItem("llm_service_keys", JSON.stringify(existingKeys));

    render(<LLMSettingsModal onClose={onClose} />);

    // Find the input fields by their placeholder text
    await waitFor(() => {
      const openaiInput = screen.getByPlaceholderText("Enter OpenAI API Key");
      const anthropicInput = screen.getByPlaceholderText(
        "Enter Anthropic API Key",
      );

      expect(openaiInput.value).toBe("existing-openai-key");
      expect(anthropicInput.value).toBe("existing-anthropic-key");
    });
  });

  it("removes a service when clicking the remove button and saving", async () => {
    const user = userEvent.setup();
    render(<LLMSettingsModal onClose={onClose} />);

    // Add a new service
    const idInput = screen.getByLabelText("Service ID");
    const labelInput = screen.getByLabelText("Service Label");

    await user.type(idInput, "custom");
    await user.type(labelInput, "Custom Service");

    await user.click(screen.getByText("Add Service"));

    // Wait for the new service to appear
    await waitFor(() => {
      expect(screen.getByText("Custom Service")).toBeDefined();
    });

    // Find all delete icon buttons
    const deleteButtons = screen
      .getAllByRole("button", {
        hidden: true,
      })
      .filter((button) =>
        button.closest("div")?.textContent?.includes("Custom Service"),
      );

    // Click the delete button for the custom service
    await user.click(deleteButtons[0]);

    // Save changes
    await user.click(screen.getByText("Save"));

    // Verify onClose was called
    expect(onClose).toHaveBeenCalled();
  });

  it("renders model selection dropdowns for each service", async () => {
    render(<LLMSettingsModal onClose={onClose} />);

    // Check for model selection labels for each provider
    expect(screen.getByText("OpenAI Model")).toBeDefined();
    expect(screen.getByText("Anthropic Model")).toBeDefined();
    expect(screen.getByText("Together Model")).toBeDefined();
  });

  it("loads provider-specific models from localStorage", async () => {
    // Setup provider models in localStorage
    const providerModels = {
      openai: "gpt-4",
      anthropic: "claude-3-opus",
      together: "llama-3",
    };
    localStorageMock.setItem(
      "llm_provider_models",
      JSON.stringify(providerModels),
    );

    render(<LLMSettingsModal onClose={onClose} />);

    // Check if the model selections are populated with the default values
    await waitFor(() => {
      const openaiModelSelect = screen.getByTestId("openai-model-select");
      const anthropicModelSelect = screen.getByTestId("anthropic-model-select");
      const togetherModelSelect = screen.getByTestId("together-model-select");

      expect(openaiModelSelect.value).toBe("gpt-4");
      expect(anthropicModelSelect.value).toBe("claude-3-opus");
      expect(togetherModelSelect.value).toBe("llama-3");
    });
  });

  it("saves provider-specific models to localStorage", async () => {
    const user = userEvent.setup();
    render(<LLMSettingsModal onClose={onClose} />);

    // Click the OpenAI model dropdown to show options
    const openaiModelSelect = screen.getByTestId("openai-model-select");
    await user.click(openaiModelSelect);

    // Select a model for OpenAI
    await waitFor(() => {
      const gpt4Option = screen.getByText("GPT-4");
      user.click(gpt4Option);
    });

    // Click the Anthropic model dropdown to show options
    const anthropicModelSelect = screen.getByTestId("anthropic-model-select");
    await user.click(anthropicModelSelect);

    // Select a model for Anthropic
    await waitFor(() => {
      const claudeOption = screen.getByText("Claude 3 Opus");
      user.click(claudeOption);
    });

    // Save the settings
    await user.click(screen.getByText("Save"));

    // Check localStorage was updated with the provider-specific models
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "llm_provider_models",
      expect.stringContaining("gpt-4"),
    );
    expect(localStorageMock.setItem).toHaveBeenCalledWith(
      "llm_provider_models",
      expect.stringContaining("claude-3-opus"),
    );

    // Check onClose was called
    expect(onClose).toHaveBeenCalled();
  });

  it("shows provider-specific model options when clicking a dropdown", async () => {
    const user = userEvent.setup();
    render(<LLMSettingsModal onClose={onClose} />);

    // Click the OpenAI model dropdown to show options
    const openaiModelSelect = screen.getByTestId("openai-model-select");
    await user.click(openaiModelSelect);

    // Check that only OpenAI model options are displayed
    await waitFor(() => {
      expect(screen.getByText("GPT-4")).toBeDefined();
      expect(screen.getByText("GPT-3.5 Turbo")).toBeDefined();
      expect(screen.queryByText("Claude 3 Opus")).toBeNull(); // Anthropic model should not be shown
    });

    // Close the OpenAI dropdown
    await user.click(openaiModelSelect);

    // Click the Anthropic model dropdown to show options
    const anthropicModelSelect = screen.getByTestId("anthropic-model-select");
    await user.click(anthropicModelSelect);

    // Check that only Anthropic model options are displayed
    await waitFor(() => {
      expect(screen.getByText("Claude 3 Opus")).toBeDefined();
      expect(screen.getByText("Claude 3 Sonnet")).toBeDefined();
      expect(screen.queryByText("GPT-4")).toBeNull(); // OpenAI model should not be shown
    });
  });
});
