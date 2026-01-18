import fs from "node:fs";
import { Codex } from "@openai/codex-sdk";

function writeEvent(event) {
  process.stdout.write(`${JSON.stringify(event)}\n`);
}

function extractText(result) {
  if (typeof result === "string") {
    return result;
  }
  if (result && typeof result === "object") {
    const candidates = [result.text, result.message, result.output, result.response];
    for (const candidate of candidates) {
      if (typeof candidate === "string" && candidate.trim()) {
        return candidate;
      }
    }
    if (Array.isArray(result.content)) {
      const parts = [];
      for (const block of result.content) {
        if (block && typeof block === "object") {
          const text = block.text || block.delta;
          if (typeof text === "string" && text.trim()) {
            parts.push(text);
          }
        } else if (typeof block === "string") {
          parts.push(block);
        }
      }
      if (parts.length > 0) {
        return parts.join("");
      }
    }
  }
  try {
    return JSON.stringify(result);
  } catch {
    return String(result ?? "");
  }
}

function extractThreadId(thread) {
  if (!thread || typeof thread !== "object") {
    return null;
  }
  const candidates = [thread.id, thread.threadId, thread._id];
  for (const candidate of candidates) {
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate;
    }
  }
  return null;
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
      message: `Failed to parse input JSON: ${err instanceof Error ? err.message : String(err)}`,
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
const threadId = typeof input.threadId === "string" ? input.threadId : null;
const itemId = typeof input.itemId === "string" ? input.itemId : `item_${Date.now()}`;

const codex = new Codex();
const thread = threadId ? codex.resumeThread(threadId) : codex.startThread();
const resolvedThreadId = extractThreadId(thread);
if (resolvedThreadId) {
  writeEvent({ type: "thread.started", thread_id: resolvedThreadId });
}

writeEvent({ type: "turn.started" });
if (typeof thread.runStreamed === "function") {
  for await (const event of thread.runStreamed(prompt)) {
    writeEvent(event);
  }
} else {
  const result = await thread.run(prompt);
  const text = extractText(result);
  writeEvent({
    type: "item.started",
    item: { id: itemId, type: "agent_message" },
  });
  writeEvent({
    type: "item.completed",
    item: { id: itemId, type: "agent_message", text },
  });
}
writeEvent({ type: "turn.completed" });
