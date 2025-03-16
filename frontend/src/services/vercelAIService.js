/**
 * Map a model to its service provider
 *
 * @param {string} model - The model name (e.g., 'claude-3-sonnet', 'gpt-4')
 * @returns {string} - The service provider ID ('anthropic', 'openai', etc.)
 */
export function getModelServiceId(model) {
  // Map models to their service providers
  if (model.startsWith("claude")) {
    return "anthropic";
  } else if (model.startsWith("gpt")) {
    return "openai";
  } else if (model.startsWith("mixtral") || model.startsWith("mistral")) {
    return "together";
  } else if (model.startsWith("llama")) {
    return "meta";
  }

  // Default case - unknown model
  console.warn(`Unknown model provider for: ${model}`);
  return null;
}

/**
 * Get API key for the specified service provider
 *
 * @param {string} serviceId - The ID of the service provider
 * @returns {string|null} - The API key or null if not found
 */
export function getApiKey(serviceId) {
  if (!serviceId) return null;

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
 * Mock chat API response when the backend is unavailable
 *
 * @param {string} message - User message
 * @param {string} model - Model ID
 * @returns {ReadableStream} - A mock stream of responses
 */
function mockChatResponse(message, model) {
  console.log(`🚨 Using MOCK response with ${model} (backend unavailable)`);

  // Get the current window location to determine server port
  const currentOrigin = window.location.origin;
  const currentPort = window.location.port || "80";

  // Detect if this is a Claude model
  const isClaudeModel = model.startsWith("claude");
  const isNewClaudeModel =
    model.includes("claude-3.5") || model.includes("claude-3-5");

  // Create a specific response for Claude 3.5
  let modelDescription = model;
  if (isNewClaudeModel) {
    modelDescription = "Claude 3.5 Sonnet (MOCK RESPONSE)";
  } else if (isClaudeModel) {
    modelDescription = "Claude (MOCK RESPONSE)";
  }

  // Create a simple mock response based on the model
  const mockResponses = [
    {
      content: `⚠️ This is a mock response since the API connection failed. `,
      delay: 200,
    },
    { content: "I notice you're using ", delay: 100 },
    { content: modelDescription, delay: 150 },
    { content: `. Your message was: "${message}"\n\n`, delay: 200 },
    {
      content: `The backend API endpoint at ${currentOrigin}/api/chat returned an error. `,
      delay: 200,
    },
    {
      content: "Here are some troubleshooting tips:\n\n",
      delay: 200,
    },
    {
      content:
        "1. Check that you're connecting to the right server port (currently " +
        currentPort +
        ").\n",
      delay: 200,
    },
    {
      content: `2. Verify your API key for ${isClaudeModel ? "Anthropic" : "the selected model"} is correct and has access to ${model}.\n`,
      delay: 200,
    },
    {
      content:
        "3. Try the debug page at /debug.html to test the API endpoints directly.\n",
      delay: 200,
    },
    {
      content:
        "4. Look for error messages in the browser console and server logs.",
      delay: 200,
    },
  ];

  // Create a ReadableStream to simulate streaming response
  return new ReadableStream({
    async start(controller) {
      let fullResponse = "";

      // Stream each part with delays
      for (const part of mockResponses) {
        fullResponse += part.content;

        // Create an SSE formatted message
        const message = `data: ${JSON.stringify({
          role: "assistant",
          content: fullResponse,
        })}\n\n`;

        // Add to stream
        const encoder = new TextEncoder();
        controller.enqueue(encoder.encode(message));

        // Wait for delay
        await new Promise((resolve) => setTimeout(resolve, part.delay));
      }

      // End the stream
      controller.enqueue(new TextEncoder().encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
}

/**
 * Send a message to an LLM with the Vercel AI SDK
 *
 * @param {Object} config - Configuration for the message
 * @param {string} config.message - The message to send
 * @param {string} config.model - The model to use
 * @param {Function} config.onStart - Callback for when streaming starts
 * @param {Function} config.onMessage - Callback for each message chunk
 * @param {Function} config.onError - Callback for errors
 * @param {Function} config.onFinish - Callback for when streaming finishes
 * @returns {Promise<Object>} - A promise that resolves when the message is sent
 */
export async function sendMessageWithVercel({
  message,
  model,
  onStart,
  onMessage,
  onError,
  onFinish,
}) {
  // Create an abort controller to handle cancellation
  const controller = new AbortController();

  // Get the service provider for this model
  const serviceId = getModelServiceId(model);
  console.log(`Using model ${model} with service ${serviceId}`);

  // Get the API key for this provider
  const apiKey = getApiKey(serviceId);

  // If no API key found and it's not a local model, show an error
  if (!apiKey && !model.includes("local")) {
    const error = new Error(
      `No API key found for ${model}. Please add it in Settings.`,
    );

    if (onError) {
      onError(error);
    } else {
      console.error(error);
    }

    if (onFinish) {
      onFinish();
    }

    return controller;
  }

  try {
    console.log(
      `Sending message to ${model} with API key: ${apiKey ? "present" : "missing"}`,
    );

    // Notify that streaming is starting
    if (onStart) {
      onStart();
    }

    let response;
    let isMockResponse = false;
    let finalContent = "";

    // Get the current window location to determine the server origin
    const currentOrigin = window.location.origin;
    console.log(`Current origin: ${currentOrigin}`);

    // Check for specific development scenarios
    const currentPort = window.location.port || "80";

    // Instead of hardcoding a fallback port, we'll try the current port first
    // This should work in most cases as the API middleware runs on the same server
    let apiUrl = `http://localhost:${currentPort}/api/chat`;
    console.log(`Using API on the same port: ${currentPort}`);

    // We'll let the fallback mechanism handle any failures

    console.log(`Making API request to: ${apiUrl}`);

    try {
      // Try to use the new API endpoint compatible with Vercel AI SDK
      response = await fetch(apiUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
        },
        body: JSON.stringify({
          messages: [{ role: "user", content: message }],
          model,
        }),
        signal: controller.signal,
      });

      // Check if endpoint exists
      if (response.status === 404) {
        throw new Error("API endpoint not found (404)");
      }

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
    } catch (error) {
      console.error("Initial API request failed:", error);

      // If we're using a custom URL and it failed, try the original URL
      if (apiUrl !== `${currentOrigin}/api/chat`) {
        console.log("Trying original URL as fallback...");
        try {
          response = await fetch(`${currentOrigin}/api/chat`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              ...(apiKey && { Authorization: `Bearer ${apiKey}` }),
            },
            body: JSON.stringify({
              messages: [{ role: "user", content: message }],
              model,
            }),
            signal: controller.signal,
          });

          if (!response.ok) {
            throw new Error(
              `HTTP error with fallback URL! status: ${response.status}`,
            );
          }
        } catch (fallbackError) {
          console.error("Fallback API request also failed:", fallbackError);

          // If both URLs fail with 404, use the mock implementation
          if (
            error.message.includes("404") ||
            fallbackError.message.includes("404")
          ) {
            console.warn(
              "Backend API endpoint not available, using mock implementation",
            );

            // Set flag for mock response
            isMockResponse = true;

            // Use mock implementation when backend is unavailable
            const mockStream = mockChatResponse(message, model);
            response = new Response(mockStream, {
              headers: { "Content-Type": "text/event-stream" },
            });
          } else {
            // If it's not a 404, rethrow the original error
            throw error;
          }
        }
      } else {
        // Check if this is a 404 error (API endpoint not available)
        if (error.message.includes("404")) {
          console.warn(
            "Backend API endpoint not available, using mock implementation",
          );

          // Set flag for mock response
          isMockResponse = true;

          // Use mock implementation when backend is unavailable
          const mockStream = mockChatResponse(message, model);
          response = new Response(mockStream, {
            headers: { "Content-Type": "text/event-stream" },
          });
        } else {
          // Rethrow other errors
          throw error;
        }
      }
    }

    // The response should be a readable stream in Server-Sent Event format
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let result = "";

    // Setup handler to abort the fetch when requested
    const abortFetch = () => {
      reader.cancel("User aborted the request");
      if (onFinish) onFinish();
    };
    controller.signal.addEventListener("abort", abortFetch);

    try {
      while (true) {
        const { done, value } = await reader.read();

        if (done) {
          break;
        }

        // Decode the chunk and append to result
        const chunk = decoder.decode(value, { stream: true });

        try {
          // Process SSE formatted messages
          const lines = chunk.split("\n").filter((line) => line.trim() !== "");

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              // Special handling for [DONE] message
              if (line.includes("[DONE]")) {
                continue;
              }

              try {
                const data = JSON.parse(line.substring(6));

                if (data.error) {
                  if (onError) {
                    onError(new Error(data.error));
                  }
                  continue;
                }

                // Extract content based on the format
                if (data.content !== undefined) {
                  result = data.content;
                  finalContent = data.content;

                  // Call the message handler with the updated content
                  if (onMessage) {
                    onMessage(result);
                  }
                } else if (data.choices && data.choices[0]?.delta?.content) {
                  // Handle OpenAI format
                  result += data.choices[0].delta.content;
                  finalContent = result;

                  // Call the message handler with the updated content
                  if (onMessage) {
                    onMessage(result);
                  }
                }
              } catch (err) {
                console.warn("Error parsing SSE data:", err, line);
              }
            }
          }
        } catch (err) {
          console.error("Error processing stream chunk:", err);
        }
      }

      // If this request succeeded with a custom port, save it for future use
      if (apiUrl !== `${currentOrigin}/api/chat` && !isMockResponse) {
        try {
          const port = new URL(apiUrl).port;
          localStorage.setItem("preferred_api_port", port);
          console.log(`Saved successful API port (${port}) to localStorage`);
        } catch (e) {
          console.warn("Could not save preferred port:", e);
        }
      }

      // Call the finish handler with the final content
      // This ensures we always have the complete message
      if (onFinish) {
        // For mock responses, ensure we pass the final content
        if (isMockResponse && finalContent) {
          onFinish(finalContent);
        } else {
          onFinish(finalContent);
        }
      }
    } catch (error) {
      console.error("Error reading stream:", error);
      if (onError) {
        onError(error);
      }
      if (onFinish) {
        onFinish();
      }
    } finally {
      controller.signal.removeEventListener("abort", abortFetch);
    }

    return controller;
  } catch (error) {
    console.error("Failed to process request:", error);

    if (onError) {
      onError(error);
    }

    if (onFinish) {
      onFinish();
    }

    return controller;
  }
}

/**
 * Gets the list of available models, filtered by available API keys
 *
 * @returns {Promise<Array>} - A promise that resolves to an array of models
 */
export async function getAvailableModels() {
  console.log("Fetching available models...");

  // Get API keys from localStorage to determine available models
  let apiKeys = {};
  let providerModels = {};

  try {
    const keys = localStorage.getItem("llm_service_keys");
    if (keys) {
      apiKeys = JSON.parse(keys);
      console.log("Found API keys for providers:", Object.keys(apiKeys));
    } else {
      console.log("No API keys found in localStorage");
    }

    // Also get preferred models per provider
    const models = localStorage.getItem("llm_provider_models");
    if (models) {
      providerModels = JSON.parse(models);
    }
  } catch (error) {
    console.error("Error loading API keys or provider models:", error);
  }

  // List of current Anthropic models
  const anthropicModels = [
    {
      id: "claude-3-sonnet-20240229",
      name: "Claude 3 Sonnet",
      serviceId: "anthropic",
    },
    {
      id: "claude-3-opus-20240229",
      name: "Claude 3 Opus",
      serviceId: "anthropic",
    },
    {
      id: "claude-3-haiku-20240307",
      name: "Claude 3 Haiku",
      serviceId: "anthropic",
    },
    // Add the newer ones
    {
      id: "claude-3-5-sonnet-20240620",
      name: "Claude 3.5 Sonnet",
      serviceId: "anthropic",
    },
  ];

  // List of current OpenAI models
  const openaiModels = [
    { id: "gpt-4", name: "GPT-4", serviceId: "openai" },
    { id: "gpt-4-turbo", name: "GPT-4 Turbo", serviceId: "openai" },
    { id: "gpt-3.5-turbo", name: "GPT-3.5 Turbo", serviceId: "openai" },
  ];

  // Combine all default models
  const defaultModels = [...anthropicModels, ...openaiModels];

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
        id: "claude-3-opus-20240229",
        name: "Claude 3 Opus (API key required)",
        serviceId: "anthropic",
      },
    ];
  }

  // Try to fetch models from backend, fall back to local list if that fails
  try {
    console.log("Attempting to fetch models from API...");

    // Create an AbortController to handle request timeout
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 second timeout

    try {
      const response = await fetch("http://localhost:3000/api/models", {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId); // Clear the timeout if request completes

      console.log(`API response status: ${response.status}`);
      const contentType = response.headers.get("content-type");
      console.log(`API response content-type: ${contentType}`);

      if (response.ok) {
        // Only proceed with valid JSON response
        if (!contentType || !contentType.includes("application/json")) {
          console.warn("API returned non-JSON response for models");
          const text = await response.text();
          console.warn(
            "Response text (first 100 chars):",
            text.substring(0, 100),
          );
          return availableModels;
        }

        const backendModels = await response.json();
        console.log(`Received ${backendModels?.length || 0} models from API`);

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
      } else {
        // Handle non-200 responses more explicitly
        console.warn(`Failed to fetch models from backend: ${response.status}`);
        const text = await response.text();
        console.warn("Error response text:", text.substring(0, 100));
      }
    } catch (abortError) {
      if (abortError.name === "AbortError") {
        console.warn("Models API request timed out after 5 seconds");
      } else {
        throw abortError; // Re-throw if it's not a timeout
      }
    }
  } catch (error) {
    console.warn("Failed to fetch models from backend:", error);
    // Fall back to filtered client-side models
  }

  console.log(`Returning ${availableModels.length} client-side models`);
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
    provider: model.serviceId,
    isDefault: model.isDefault,
  };
}
