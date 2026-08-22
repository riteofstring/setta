import { setTimeout as delay } from "node:timers/promises";

import { productionTimeoutMs } from "./browser-processes.mjs";

export async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", {
    awaitPromise: true,
    expression,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(
      `Browser evaluation failed: ${response.exceptionDetails.exception?.description ?? response.exceptionDetails.text}`,
    );
  }
  return response.result?.value;
}

export async function waitFor(client, description, expression) {
  const deadline = Date.now() + productionTimeoutMs;
  while (Date.now() < deadline) {
    if (await evaluate(client, expression)) {
      return;
    }
    await delay(100);
  }
  throw new Error(`${description} did not occur within 30 seconds.`);
}

export async function navigate(client, origin) {
  const loaded = client.waitForEvent("Page.loadEventFired", 15_000);
  await client.send("Page.navigate", { url: origin });
  await loaded;
}
