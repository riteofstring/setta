/**
 * Returns a list of available LLM models for the frontend
 */
export async function getModels(req, res) {
  console.log("🔍 API: Models endpoint called");

  try {
    // Return a standard set of models that are commonly available
    const models = [
      // Anthropic models
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
      {
        id: "claude-3-5-sonnet-20240620",
        name: "Claude 3.5 Sonnet",
        serviceId: "anthropic",
      },

      // OpenAI models
      {
        id: "gpt-4-turbo",
        name: "GPT-4 Turbo",
        serviceId: "openai",
      },
      {
        id: "gpt-4",
        name: "GPT-4",
        serviceId: "openai",
      },
      {
        id: "gpt-3.5-turbo",
        name: "GPT-3.5 Turbo",
        serviceId: "openai",
      },

      // Together AI models
      {
        id: "mixtral-8x7b-instruct",
        name: "Mixtral 8x7B Instruct",
        serviceId: "together",
      },
      {
        id: "mistral-medium",
        name: "Mistral Medium",
        serviceId: "together",
      },
    ];

    console.log(`🔢 API: Returning ${models.length} models`);

    // Set content type explicitly
    res.setHeader("Content-Type", "application/json");

    // Use res.end instead of res.json to ensure the response is properly closed
    res.end(JSON.stringify(models));
  } catch (error) {
    console.error("❌ Error fetching models:", error);

    // Set content type explicitly
    res.setHeader("Content-Type", "application/json");
    res.statusCode = 500;

    // Use res.end instead of res.json to ensure the response is properly closed
    res.end(
      JSON.stringify({ error: error.message || "Error fetching models" }),
    );
  }
}
