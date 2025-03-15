import { fetchEventSource } from "@microsoft/fetch-event-source";

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

  try {
    // Start the stream
    await fetchEventSource("/api/chat", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
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
  const response = await fetch("/api/models");

  if (!response.ok) {
    throw new Error(`Failed to fetch models: ${response.status}`);
  }

  return response.json();
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
