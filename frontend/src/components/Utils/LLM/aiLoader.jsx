import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { generateText, streamText } from "ai";

const providers = {
  OpenAI: (apiKey) => createOpenAI({ apiKey }),
  Anthropic: (apiKey) => createAnthropic({ apiKey }),
};

export async function aiLoader({
  provider,
  modelName,
  apiKey,
  prompt,
  stream = false,
  modelOptions = {},
}) {
  try {
    if (!providers[provider]) {
      throw new Error(
        `Provider "${provider}" not supported. Available providers: ${Object.keys(providers).join(", ")}`,
      );
    }

    const providerInstance = providers[provider](apiKey);
    const model = providerInstance(modelName, modelOptions);

    if (stream) {
      const { textStream } = await streamText({
        model,
        prompt,
      });

      return textStream;
    }

    const { text } = await generateText({
      model,
      prompt,
    });

    return text;
  } catch (error) {
    console.error(`Error in aiLoader: ${error.message}`);
    throw error;
  }
}

export async function collectStreamToString(stream) {
  let fullText = "";
  for await (const chunk of stream) {
    fullText += chunk;
  }
  return fullText;
}

// Usage examples:

// Non-streaming example
// const response = await aiLoader({
//   provider: 'OpenAI',
//   modelName: 'gpt-4o',
//   apiKey: 'your-openai-api-key',
//   prompt: 'Explain quantum computing in simple terms.'
// });

// Streaming example
// const stream = await aiLoader({
//   provider: 'Anthropic',
//   modelName: 'claude-3-opus-20240229',
//   apiKey: 'your-anthropic-api-key',
//   prompt: 'Write a short story about a robot.',
//   stream: true
// });
//
// for await (const chunk of stream) {
//   process.stdout.write(chunk); // Print chunks as they arrive
// }
