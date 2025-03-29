import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import { streamText } from "ai";

function openai(apiKey, model) {
  if (!apiKey) {
    throw new Error("OpenAI API key is required");
  }

  const openai = createOpenAI({
    apiKey: apiKey,
  });

  return {
    llmprovider: openai,
    model: model || "gpt-4o",
  };
}

function anthropic(apiKey, model) {
  if (!apiKey) {
    throw new Error("Anthropic API key is required");
  }

  const anthropic = createAnthropic({
    apiKey: apiKey,
  });

  return {
    llmprovider: anthropic,
    model: model || "claude-3-7-sonnet-20250219",
  };
}

async function callModel({ llmprovider, model, prompt }) {
  const { textStream } = await streamText({
    model: model,
    prompt: prompt,
    api: llmprovider,
  });

  let fullResponse = "";
  for await (const textPart of textStream) {
    fullResponse += textPart;
  }
  return fullResponse;
}

export async function aiLoader({ vendor, model, prompt, apiKey }) {
  switch (vendor) {
    case "OpenAI": {
      const config = openai(apiKey, model);
      return await callModel({
        llmprovider: config.llmprovider,
        model: config.model,
        prompt,
      });
    }
    case "Anthropic": {
      const config = anthropic(apiKey, model);
      return await callModel({
        llmprovider: config.llmprovider,
        model: config.model,
        prompt,
      });
    }
    default: {
      throw new Error(`Unsupported vendor: ${vendor}`);
    }
  }
}
