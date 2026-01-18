import fs from "node:fs";
import { query } from "@anthropic-ai/claude-agent-sdk";

function writeEvent(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function readInput() {
  const raw = fs.readFileSync(0, "utf8").trim();
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch (err) {
    writeEvent({
      type: "error",
      message: `Failed to parse input JSON: ${
        err instanceof Error ? err.message : String(err)
      }`,
    });
    process.exit(1);
  }
}

process.on("unhandledRejection", (err) => {
  writeEvent({
    type: "error",
    message: err instanceof Error ? err.message : String(err),
  });
  process.exit(1);
});

const input = readInput();
if (!input) {
  process.exit(0);
}

const prompt = typeof input.prompt === "string" ? input.prompt : "";
const options = {};
if (typeof input.systemPrompt === "string" && input.systemPrompt.trim()) {
  options.systemPrompt = input.systemPrompt;
}
if (typeof input.mcpConfig === "string" && input.mcpConfig.trim()) {
  options.mcpConfig = input.mcpConfig;
}
if (Array.isArray(input.allowedTools) && input.allowedTools.length > 0) {
  options.allowedTools = input.allowedTools;
}
options.includePartialMessages = true;

const request = { prompt };
if (Object.keys(options).length > 0) {
  request.options = options;
}

for await (const message of query(request)) {
  writeEvent(message);
}
