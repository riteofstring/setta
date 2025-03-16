import { AnthropicStream, OpenAIStream, StreamingTextResponse } from "ai";

/**
 * Stream chat responses from various AI providers
 * This API is compatible with the Vercel AI SDK
 */
export async function streamChat(req, res) {
  try {
    console.log("[API-DEBUG] Processing chat request...");
    console.log("[API-DEBUG] Request method:", req.method);
    console.log("[API-DEBUG] Request URL:", req.url);

    // Dump all headers for debugging
    console.log(
      "[API-DEBUG] All request headers:",
      JSON.stringify(
        typeof req.headers.entries === "function"
          ? Object.fromEntries(
              [...req.headers.entries()].map(([k, v]) =>
                k.toLowerCase().includes("key") ||
                k.toLowerCase().includes("auth")
                  ? [k, "***REDACTED***"]
                  : [k, v],
              ),
            )
          : Object.fromEntries(
              Object.entries(req.headers).map(([k, v]) =>
                k.toLowerCase().includes("key") ||
                k.toLowerCase().includes("auth")
                  ? [k, "***REDACTED***"]
                  : [k, v],
              ),
            ),
      ),
    );

    // Get request data
    let requestBody;
    try {
      requestBody = await req.json();
      console.log(
        "[API-DEBUG] Request body received:",
        JSON.stringify({
          ...requestBody,
          messages: requestBody.messages
            ? `[${requestBody.messages.length} messages]`
            : undefined,
        }),
      );
    } catch (parseError) {
      console.error("[API-DEBUG] Error parsing request body:", parseError);
      res.setHeader("Content-Type", "application/json");
      res.status(400);
      return res.json({
        error: "Invalid request body",
        details: parseError.message,
      });
    }

    const { messages, model, selectedService } = requestBody;
    console.log(
      `[API-DEBUG] Request for model: ${model}, service: ${selectedService || "default"} with ${messages?.length || 0} messages`,
    );

    // Determine the service based on model if not provided
    const service = selectedService || getServiceFromModel(model);
    console.log(`[API-DEBUG] Determined service: ${service}`);

    // Extract API key from headers using Vercel AI SDK compatible approach
    const apiKey = extractApiKey(req.headers, service, model);

    // Safe logging of API key details
    if (apiKey) {
      const keyPrefix = apiKey.substring(0, 5);
      const keyLength = apiKey.length;
      console.log(
        `[API-DEBUG] API key found (prefix: ${keyPrefix}***, length: ${keyLength})`,
      );
    } else {
      console.log("[API-DEBUG] No API key found in headers");
    }

    if (!apiKey) {
      console.log("[API-DEBUG] Returning 401 - API key required");
      res.setHeader("Content-Type", "application/json");
      res.status(401);
      return res.json({
        error:
          "API key is required. Set it in the Authorization header as Bearer <key>.",
        details:
          "Check that your frontend is correctly sending the API key in the appropriate header for this provider.",
        service,
        model,
      });
    }

    // Verify API key format validation
    if (!isValidApiKey(apiKey, service)) {
      console.log(`[API-DEBUG] Invalid API key format for ${service}`);
      res.setHeader("Content-Type", "application/json");
      res.status(401);
      return res.json({
        error: `Invalid API key format for ${service}`,
        details: `The provided API key doesn't match the expected format for ${service}`,
        service,
        model,
      });
    }

    // Route to appropriate AI provider based on service
    if (service === "openai" || model.startsWith("gpt")) {
      return handleOpenAI(apiKey, model, messages, res);
    } else if (service === "anthropic" || model.startsWith("claude")) {
      return handleAnthropic(apiKey, model, messages, res);
    } else if (
      service === "together" ||
      model.startsWith("mixtral") ||
      model.startsWith("mistral")
    ) {
      return handleTogether(apiKey, model, messages, res);
    } else if (service === "meta" || model.startsWith("llama")) {
      return handleMeta(apiKey, model, messages, res);
    } else {
      res.setHeader("Content-Type", "application/json");
      res.status(400);
      return res.json({
        error: `Unsupported model or service: ${model}`,
        service,
        model,
      });
    }
  } catch (error) {
    console.error("[API-DEBUG] Error in chat API:", error);
    res.setHeader("Content-Type", "application/json");
    res.status(500);
    return res.json({
      error: error.message || "Internal server error",
      stack: error.stack,
    });
  }
}

/**
 * Extract API key from request headers based on service
 * This is compatible with Vercel AI SDK's approach
 */
function extractApiKey(headers, service, model) {
  let apiKey = null;

  if (!headers) return null;

  try {
    // For Anthropic's Claude models
    if (service === "anthropic" || model.startsWith("claude")) {
      // Get API key from x-api-key header (preferred for Claude 3.5)
      if (typeof headers.get === "function") {
        apiKey = headers.get("x-api-key");
      } else {
        apiKey = headers["x-api-key"] || headers["X-Api-Key"];
      }

      // If x-api-key is not present, try Authorization header as fallback
      if (!apiKey) {
        let authHeader = "";
        if (typeof headers.get === "function") {
          authHeader = headers.get("authorization") || "";
        } else {
          authHeader =
            headers["authorization"] || headers["Authorization"] || "";
        }

        // Extract token from Bearer format if present
        apiKey = authHeader.startsWith("Bearer ")
          ? authHeader.slice(7)
          : authHeader;
      }

      console.log(
        `[API-DEBUG] Anthropic API key extracted: ${Boolean(apiKey)}`,
      );
    }
    // For all other providers
    else {
      let authHeader = "";
      if (typeof headers.get === "function") {
        authHeader = headers.get("authorization") || "";
      } else {
        authHeader = headers["authorization"] || headers["Authorization"] || "";
      }

      // Extract token from Bearer format if present
      apiKey = authHeader.startsWith("Bearer ")
        ? authHeader.slice(7)
        : authHeader;
      console.log(`[API-DEBUG] Standard API key extracted: ${Boolean(apiKey)}`);
    }
  } catch (error) {
    console.error("[API-DEBUG] Error extracting API key:", error);
  }

  return apiKey;
}

/**
 * Determine service from model name if not explicitly provided
 */
function getServiceFromModel(model = "") {
  if (!model) return "unknown";

  if (model.startsWith("gpt")) return "openai";
  if (model.startsWith("claude")) return "anthropic";
  if (model.startsWith("mixtral") || model.startsWith("mistral"))
    return "together";
  if (model.startsWith("llama")) return "meta";

  return "unknown";
}

/**
 * Validate API key format based on service
 */
function isValidApiKey(key, service) {
  if (!key || typeof key !== "string" || key.length < 20) {
    return false;
  }

  if (service === "anthropic") {
    // Anthropic keys typically start with "sk-ant"
    return key.startsWith("sk-ant") || key.length >= 30;
  }

  if (service === "openai") {
    // OpenAI keys typically start with "sk-"
    return key.startsWith("sk-") && key.length >= 30;
  }

  // For other services, just check length
  return key.length >= 20;
}

/**
 * Handle OpenAI API requests
 */
async function handleOpenAI(apiKey, model, messages, res) {
  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({
        error: { message: `OpenAI API error: ${response.status}` },
      }));
      throw new Error(
        error.error?.message || `OpenAI API error: ${response.status}`,
      );
    }

    // Transform the response into a compatible stream
    const stream = OpenAIStream(response);

    // Return a StreamingTextResponse which is compatible with Vercel AI SDK
    return new StreamingTextResponse(stream);
  } catch (error) {
    console.error("OpenAI API error:", error);
    res.setHeader("Content-Type", "application/json");
    res.status(500);
    return res.json({ error: error.message || "OpenAI API error" });
  }
}

/**
 * Handle Anthropic API requests
 */
async function handleAnthropic(apiKey, model, messages, res) {
  try {
    // Check if this is Claude 3.5 model
    const isClaude35 =
      model.includes("claude-3-5") || model.includes("claude-3.5");
    console.log(`[API-DEBUG] Is Claude 3.5 model: ${isClaude35}`);

    // Format messages for Anthropic
    const formattedMessages = messages.map((msg) => ({
      role: msg.role === "user" ? "user" : "assistant",
      content: msg.content,
    }));

    // Use the most recent Anthropic API version
    // Claude 3.5 uses 2023-06-01
    const apiVersion = "2023-06-01";

    console.log(`[API-DEBUG] Making Anthropic API request for model: ${model}`);
    console.log(`[API-DEBUG] API version: ${apiVersion}`);
    console.log(`[API-DEBUG] Number of messages: ${formattedMessages.length}`);

    // Prepare request body
    const requestBody = {
      model,
      messages: formattedMessages,
      stream: true,
      max_tokens: 4000,
    };

    console.log(
      `[API-DEBUG] Request body: ${JSON.stringify(requestBody, null, 2)}`,
    );

    // Set up headers for Anthropic API
    const headers = {
      "Content-Type": "application/json",
      "anthropic-version": apiVersion,
    };

    // Include authentication header based on model
    if (apiKey) {
      if (isClaude35) {
        // For Claude 3.5, prefer x-api-key
        headers["x-api-key"] = apiKey;
      } else {
        // For older Claude models, include both
        headers["x-api-key"] = apiKey;
        headers["Authorization"] = `Bearer ${apiKey}`;
      }
    }

    console.log(
      `[API-DEBUG] Request headers (sanitized): ${JSON.stringify(
        {
          ...headers,
          "x-api-key": headers["x-api-key"] ? "present" : "missing",
          Authorization: headers["Authorization"] ? "present" : "missing",
        },
        null,
        2,
      )}`,
    );

    // Execute the API call
    console.log(`[API-DEBUG] Sending request to Anthropic API for ${model}...`);
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers,
      body: JSON.stringify(requestBody),
    });

    console.log(
      `[API-DEBUG] Anthropic API response status: ${response.status}`,
    );
    console.log(
      `[API-DEBUG] Anthropic API response headers: ${JSON.stringify(Object.fromEntries([...response.headers]), null, 2)}`,
    );

    if (!response.ok) {
      // Log more detailed error information
      const errorText = await response.text();
      console.error(
        `[API-DEBUG] Anthropic API error (${response.status}):`,
        errorText,
      );

      // Try to parse error as JSON if possible
      let errorJson;
      try {
        errorJson = JSON.parse(errorText);
      } catch (e) {
        // If not JSON, use the text as is
        errorJson = { message: errorText.substring(0, 500) };
      }

      res.setHeader("Content-Type", "application/json");
      res.status(response.status || 500);
      return res.json({
        error: `Anthropic API error: ${response.status}`,
        details: errorJson,
        model: model,
      });
    }

    // Transform the response into a compatible stream
    console.log("[API-DEBUG] Creating AnthropicStream from response");
    const stream = AnthropicStream(response);

    // Return a StreamingTextResponse which is compatible with Vercel AI SDK
    console.log("[API-DEBUG] Returning StreamingTextResponse");
    return new StreamingTextResponse(stream);
  } catch (error) {
    console.error("[API-DEBUG] Anthropic API error:", error);
    res.setHeader("Content-Type", "application/json");
    res.status(500);
    return res.json({
      error: error.message || "Anthropic API error",
      stack: error.stack,
      model: model,
    });
  }
}

/**
 * Handle Together AI API requests
 */
async function handleTogether(apiKey, model, messages, res) {
  try {
    const response = await fetch(
      "https://api.together.xyz/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages,
          stream: true,
        }),
      },
    );

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: `Together API error: ${response.status}` }));
      throw new Error(error.error || `Together API error: ${response.status}`);
    }

    // Together uses the OpenAI-compatible API format
    const stream = OpenAIStream(response);
    return new StreamingTextResponse(stream);
  } catch (error) {
    console.error("Together API error:", error);
    res.setHeader("Content-Type", "application/json");
    res.status(500);
    return res.json({ error: error.message || "Together API error" });
  }
}

/**
 * Handle Meta AI (Llama) API requests
 */
async function handleMeta(apiKey, model, messages, res) {
  try {
    // For Meta models, we assume an OpenAI-compatible API
    const response = await fetch("https://api.meta.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages,
        stream: true,
      }),
    });

    if (!response.ok) {
      const error = await response
        .json()
        .catch(() => ({ error: `Meta API error: ${response.status}` }));
      throw new Error(error.error || `Meta API error: ${response.status}`);
    }

    // Meta uses an OpenAI-compatible API format
    const stream = OpenAIStream(response);
    return new StreamingTextResponse(stream);
  } catch (error) {
    console.error("Meta API error:", error);
    res.setHeader("Content-Type", "application/json");
    res.status(500);
    return res.json({ error: error.message || "Meta API error" });
  }
}
