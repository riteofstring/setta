import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createServer } from "node:http";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { createCdpPage } from "./cdp-client.mjs";
import {
  startHeadlessChrome,
  stopHeadlessChrome,
  waitForHeadlessChrome,
} from "./headless-chrome.mjs";

async function serveConsumer(root) {
  const dist = path.join(root, "dist");
  const files = new Map([
    [
      "/",
      { body: readFileSync(path.join(dist, "index.html")), type: "text/html" },
    ],
  ]);
  const types = {
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
  };
  for (const name of readdirSync(path.join(dist, "assets"))) {
    files.set(`/assets/${name}`, {
      body: readFileSync(path.join(dist, "assets", name)),
      type: types[path.extname(name)] ?? "application/octet-stream",
    });
  }
  const server = createServer((request, response) => {
    const file = files.get(request.url);
    response.writeHead(file ? 200 : 404, {
      "Content-Type": file?.type ?? "text/plain",
    });
    response.end(file?.body ?? "Not found");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  return { server, url: `http://127.0.0.1:${server.address().port}/` };
}

async function evaluate(client, expression) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitFor(client, expression) {
  const deadline = Date.now() + 8000;
  while (Date.now() < deadline) {
    if (await evaluate(client, expression)) return;
    await delay(50);
  }
  throw new Error(`Packed editor did not reach: ${expression}`);
}

export async function verifyPackedConsumerBrowser(root) {
  const { server, url } = await serveConsumer(root);
  let browser;
  let client;
  const errors = [];
  try {
    browser = startHeadlessChrome(
      process.env.PYTHON_CANVAS_CHROME_BINARY ?? null,
    );
    ({ client } = await createCdpPage(await waitForHeadlessChrome(browser)));
    client.on("Runtime.exceptionThrown", (event) =>
      errors.push(
        event.exceptionDetails.exception?.description ??
          event.exceptionDetails.text,
      ),
    );
    await client.send("Runtime.enable");
    await client.send("Page.enable");
    await client.send("Emulation.setDeviceMetricsOverride", {
      width: 1800,
      height: 1000,
      deviceScaleFactor: 1,
      mobile: false,
    });
    await client.send("Page.navigate", { url });
    const editor =
      "document.querySelector('[data-workspace-section-editor=editable] [contenteditable=true]')";
    await waitFor(
      client,
      `${editor}?.textContent.includes('Packed editor works')`,
    );
    assert.equal(
      await evaluate(
        client,
        "document.querySelector('[data-workspace-section-editor=read-only]')?.textContent.includes('Read-only source')",
      ),
      true,
    );
    await evaluate(client, `${editor}.focus()`);
    await client.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "Home",
      code: "Home",
      windowsVirtualKeyCode: 36,
    });
    await client.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "Home",
      code: "Home",
      windowsVirtualKeyCode: 36,
    });
    await client.send("Input.insertText", { text: "let inserted = 1; " });
    await waitFor(
      client,
      `${editor}.textContent.includes('let inserted = 1;')`,
    );
    const modifiers = process.platform === "darwin" ? 4 : 2;
    await client.send("Input.dispatchKeyEvent", {
      type: "keyDown",
      key: "z",
      code: "KeyZ",
      modifiers,
      windowsVirtualKeyCode: 90,
    });
    await client.send("Input.dispatchKeyEvent", {
      type: "keyUp",
      key: "z",
      code: "KeyZ",
      modifiers,
      windowsVirtualKeyCode: 90,
    });
    await waitFor(
      client,
      `!${editor}.textContent.includes('let inserted = 1;') && ${editor}.textContent.includes('Packed editor works')`,
    );
    assert.deepEqual(errors, []);
    console.log(
      "Packed editors render, accept typing, and undo without browser errors.",
    );
  } finally {
    client?.close();
    if (browser) await stopHeadlessChrome(browser);
    await new Promise((resolve) => server.close(resolve));
  }
}
