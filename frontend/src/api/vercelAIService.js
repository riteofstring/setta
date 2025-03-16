export async function sendMessageWithVercel({
  messages,
  model,
  onFinish,
  onUpdate,
  onError,
  selectedService,
  signal,
}) {
  const apiKey = getApiKeyForService(selectedService);

  console.log(`[DEBUG] Preparing to send message:`);
  console.log(`[DEBUG] - Service: ${selectedService}`);
  console.log(`[DEBUG] - Model: ${model}`);
  console.log(`[DEBUG] - API Key present: ${Boolean(apiKey)}`);
  console.log(`[DEBUG] - API Key length: ${apiKey ? apiKey.length : 0}`);
  console.log(
    `[DEBUG] - API Key prefix: ${apiKey ? apiKey.substring(0, 5) + "***" : "none"}`,
  );

  // Create headers as expected by Vercel AI SDK
  const headers = createVercelCompatibleHeaders(apiKey, model, selectedService);

  console.log(
    `[DEBUG] Request headers (sanitized):`,
    Object.fromEntries(
      Object.entries(headers).map(([key, value]) =>
        key.toLowerCase().includes("key") || key.toLowerCase().includes("auth")
          ? [key, "present"]
          : [key, value],
      ),
    ),
  );

  try {
    // Get the current port the application is running on
    const currentPort = window.location.port;
    const apiUrl = `${window.location.protocol}//${window.location.hostname}:${currentPort}/api/chat`;

    console.log(`[DEBUG] Sending request to: ${apiUrl}`);

    const response = await fetch(apiUrl, {
      method: "POST",
      headers,
      body: JSON.stringify({
        messages,
        model,
        selectedService,
      }),
      signal,
    });

    console.log(`[DEBUG] Response status: ${response.status}`);
    console.log(
      `[DEBUG] Response headers:`,
      Object.fromEntries([...response.headers.entries()]),
    );

    // Check for error responses
    if (!response.ok) {
      console.error(`[DEBUG] Error response: ${response.status}`);
      let errorData;
      const contentType = response.headers.get("content-type");

      if (contentType && contentType.includes("application/json")) {
        errorData = await response.json();
        console.error("[DEBUG] Error details:", errorData);
      } else {
        const text = await response.text();
        console.error("[DEBUG] Error text:", text);
        errorData = { error: text };
      }

      throw new Error(errorData.error || `API error: ${response.status}`);
    }

    // Check for streaming response
    const contentType = response.headers.get("content-type");
    if (contentType && contentType.includes("text/event-stream")) {
      console.log("[DEBUG] Stream response detected");
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let done = false;
      let accumulated = "";
      let message = { content: "" };

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;

        if (done) {
          // When the stream is done, call onFinish with the complete message
          console.log("[DEBUG] Stream completed");
          if (onFinish) onFinish(message);
          break;
        }

        // Update the accumulated content
        const chunk = decoder.decode(value, { stream: true });
        accumulated += chunk;

        // Parse and transform the chunk
        try {
          // Handle SSE format (text/event-stream)
          const lines = chunk.split("\n");
          let newContent = "";

          for (const line of lines) {
            if (line.startsWith("data: ")) {
              const data = line.slice(6);
              if (data === "[DONE]") continue;
              try {
                const parsed = JSON.parse(data);
                if (parsed.choices && parsed.choices[0]) {
                  // OpenAI format
                  const delta = parsed.choices[0].delta?.content || "";
                  newContent += delta;
                } else if (parsed.content) {
                  // Anthropic format
                  newContent += parsed.content || "";
                }
              } catch (e) {
                // If not JSON, just append the data
                newContent += data;
              }
            }
          }

          if (newContent) {
            message.content += newContent;
            if (onUpdate) onUpdate({ content: message.content });
          }
        } catch (error) {
          console.error("[DEBUG] Error parsing stream:", error);
          console.error("[DEBUG] Problematic chunk:", chunk);
        }
      }
    } else {
      // Non-streaming response
      console.log("[DEBUG] Non-stream response");
      const data = await response.json();
      if (onFinish) onFinish(data);
    }
  } catch (error) {
    console.error("[DEBUG] Error in sendMessageWithVercel:", error);

    // Log additional error details if available
    if (error.response) {
      console.error("[DEBUG] Error response data:", error.response.data);
      console.error("[DEBUG] Error response status:", error.response.status);
      console.error("[DEBUG] Error response headers:", error.response.headers);
    }

    onError?.(error);
  }
}

/**
 * Create headers that are compatible with Vercel AI SDK standards
 * This properly formats headers for different providers
 */
export function createVercelCompatibleHeaders(apiKey, model, service) {
  const headers = {
    "Content-Type": "application/json",
  };

  if (!apiKey) return headers;

  // Determine the service if not provided
  const providerService = service || getServiceFromModel(model);

  // Set proper headers based on provider
  if (providerService === "anthropic" || model.startsWith("claude")) {
    const isClaude35 =
      model.includes("claude-3-5") || model.includes("claude-3.5");

    // Set Anthropic-specific headers
    headers["anthropic-version"] = "2023-06-01";

    if (isClaude35) {
      // Claude 3.5 requires x-api-key header
      headers["x-api-key"] = apiKey;
    } else {
      // For older Claude models, include both for maximum compatibility
      headers["x-api-key"] = apiKey;
      headers["Authorization"] = `Bearer ${apiKey}`;
    }
  } else {
    // Default for OpenAI and others
    headers["Authorization"] = `Bearer ${apiKey}`;
  }

  return headers;
}

/**
 * Determine service from model name if not explicitly provided
 */
export function getServiceFromModel(model = "") {
  if (!model) return "unknown";

  if (model.startsWith("gpt")) return "openai";
  if (model.startsWith("claude")) return "anthropic";
  if (model.startsWith("mixtral") || model.startsWith("mistral"))
    return "together";
  if (model.startsWith("llama")) return "meta";

  return "unknown";
}
