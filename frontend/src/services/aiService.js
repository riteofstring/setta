import { fetchEventSource } from "@microsoft/fetch-event-source";

/**
 * Get API key for the specified LLM service
 *
 * @param {string} serviceId - The ID of the service
 * @returns {string|null} - The API key or null if not found
 */
function getApiKey(serviceId) {
  try {
    const keys = localStorage.getItem("llm_service_keys");
    if (!keys) return null;

    const keysObj = JSON.parse(keys);
    return keysObj[serviceId] || null;
  } catch (error) {
    console.error("Error retrieving API key:", error);
    return null;
  }
}

/**
 * Sends a message to the LLM and streams the response
 *
 * @param {Object} config - Configuration for the message
 * @param {string} config.message - The message to send
 * @param {string} config.model - The model to use
 * @param {Function} config.onMessage - Callback for each message chunk
 * @param {Function} config.onStart - Callback for when streaming starts
 * @param {Function} config.onError - Callback for errors
 * @param {Function} config.onComplete - Callback for when streaming completes
 * @returns {Promise<void>} - A promise that resolves when the streaming is complete
 */
export async function sendMessage({
  message,
  model,
  onMessage,
  onStart,
  onError,
  onComplete,
}) {
  // Create an abort controller to handle cancellation
  const controller = new AbortController();

  // Track the last reasoning data received
  let lastReasoning = null;
  // Flag to track if error was already handled
  let errorHandled = false;

  // Get the API key for the selected model/service
  const modelServiceId = model.split("-")[0]; // Extract service ID from model (e.g., "gpt" from "gpt-4")
  const apiKey = getApiKey(modelServiceId) || getApiKey(model);

  // If no API key is found and it's not a local model, show an error
  if (!apiKey && !model.includes("local")) {
    if (onError && !errorHandled) {
      errorHandled = true;
      onError(
        new Error(`No API key found for ${model}. Please add it in Settings.`),
      );
    }

    if (onComplete) {
      onComplete(null);
    }

    return controller;
  }

  try {
    // Start the stream
    await fetchEventSource("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
      },
      body: JSON.stringify({
        message,
        model,
      }),
      signal: controller.signal,

      onOpen(response) {
        // Check if the connection was successful
        if (response.ok && response.status === 200) {
          // Call the onStart callback if provided
          if (onStart) {
            onStart();
          }
        } else {
          // If the connection failed, throw an error
          const error = new Error(
            `Failed to connect to API: ${response.status}`,
          );
          if (onError && !errorHandled) {
            errorHandled = true;
            onError(error);
          }
          throw error;
        }
      },

      onMessage(msg) {
        try {
          // Parse the message data
          const data = JSON.parse(msg.data);

          // Extract content and reasoning
          const { content, reasoning } = data;

          // Update last reasoning if provided
          if (reasoning) {
            lastReasoning = reasoning;
          }

          // Call the onMessage callback with the content
          if (onMessage && content) {
            onMessage(content);
          }
        } catch (error) {
          console.error("Error parsing message:", error);
          if (onError && !errorHandled) {
            errorHandled = true;
            onError(error);
          }
        }
      },

      onClose() {
        // Call the onComplete callback with the last reasoning
        if (onComplete) {
          onComplete(lastReasoning);
        }
      },

      onError(error) {
        console.error("Error in stream:", error);
        if (onError && !errorHandled) {
          errorHandled = true;
          onError(error);
        }
        // Ensure we always call onComplete even on error
        if (onComplete) {
          onComplete(lastReasoning);
        }
      },
    });
  } catch (error) {
    console.error("Error in sendMessage:", error);
    if (onError && !errorHandled) {
      errorHandled = true;
      onError(error);
    }
    throw error;
  }

  // Return the abort controller to allow cancellation
  return controller;
}

/**
 * Gets the list of available models
 *
 * @returns {Promise<Array>} - A promise that resolves to an array of models
 */
export async function getAvailableModels() {
  // Get API keys from localStorage to determine available models
  let apiKeys = {};
  let providerModels = {};
  try {
    const keys = localStorage.getItem("llm_service_keys");
    if (keys) {
      apiKeys = JSON.parse(keys);
    }

    // Also get preferred models per provider
    const models = localStorage.getItem("llm_provider_models");
    if (models) {
      providerModels = JSON.parse(models);
    }
  } catch (error) {
    console.error("Error loading API keys or provider models:", error);
  }

  // Default models that are always available or require no API key
  const defaultModels = [
    { id: "gpt-4", name: "GPT-4", serviceId: "openai" },
    { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", serviceId: "openai" },
    { id: "claude-3-opus", name: "Claude 3 Opus", serviceId: "anthropic" },
    { id: "claude-3-sonnet", name: "Claude 3 Sonnet", serviceId: "anthropic" },
    { id: "claude-3-haiku", name: "Claude 3 Haiku", serviceId: "anthropic" },
  ];

  // Filter models based on available API keys
  let availableModels = defaultModels.filter((model) => {
    // If model has a serviceId and that service has an API key, include it
    return model.serviceId ? !!apiKeys[model.serviceId] : true;
  });

  // Mark preferred models for each provider
  availableModels = availableModels.map((model) => {
    if (model.serviceId && providerModels[model.serviceId] === model.id) {
      return {
        ...model,
        isDefault: true,
      };
    }
    return model;
  });

  // Ensure we always have at least one model available
  if (availableModels.length === 0) {
    console.warn(
      "No models with valid API keys found. Adding default models as fallback.",
    );
    availableModels = [
      { id: "gpt-4", name: "GPT-4 (API key required)", serviceId: "openai" },
      {
        id: "claude-3-opus",
        name: "Claude 3 Opus (API key required)",
        serviceId: "anthropic",
      },
    ];
  }

  // Try to fetch models from backend, fall back to local list if that fails
  try {
    const response = await fetch("/api/models");

    if (response.ok) {
      const backendModels = await response.json();

      if (
        backendModels &&
        Array.isArray(backendModels) &&
        backendModels.length > 0
      ) {
        // Combine backend models with our filtered models, preferring backend data if available
        const combinedModels = [
          ...availableModels,
          ...backendModels.filter(
            (backendModel) =>
              !availableModels.some((m) => m.id === backendModel.id),
          ),
        ];

        return combinedModels;
      }
    }
  } catch (error) {
    console.warn("Failed to fetch models from backend:", error);
    // Fall back to filtered client-side models
  }

  return availableModels;
}

/**
 * Helper function to create a model selector option
 *
 * @param {Object} model - The model data
 * @returns {Object} - An object with value and label properties
 */
export function formatModelOption(model) {
  return {
    value: model.id,
    label: model.name,
  };
}

/**
 * Uploads a file to the LLM API
 *
 * @param {File} file - The file to upload
 * @returns {Promise<Object>} - A promise that resolves to the upload result
 */
export async function uploadFile(file) {
  const formData = new FormData();
  formData.append("file", file);

  const response = await fetch("/api/upload", {
    method: "POST",
    body: formData,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload file: ${response.status}`);
  }

  return response.json();
}
