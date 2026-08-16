import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
} from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { createCdpPage } from "../../scripts/lib/cdp-client.mjs";

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(appRoot, "../..");
const backendRoot = path.join(appRoot, "backend");
const chromeDefaultPath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const productionTimeoutMs = 30_000;

function run(command, arguments_, options = {}) {
  const result = spawnSync(command, arguments_, {
    cwd: options.cwd ?? repositoryRoot,
    encoding: "utf8",
    env: { ...process.env, ...options.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${arguments_.join(" ")} exited with ${String(result.status)}.\n${result.stderr || result.stdout}`,
    );
  }
}

function startProcess(command, arguments_, options) {
  const child = spawn(command, arguments_, {
    cwd: options.cwd,
    env: { ...process.env, ...options.env },
    stdio: ["ignore", "pipe", "pipe"],
  });
  const output = { stderr: "", stdout: "" };
  child.stderr.on("data", (chunk) => {
    output.stderr = `${output.stderr}${String(chunk)}`.slice(-8_000);
  });
  child.stdout.on("data", (chunk) => {
    output.stdout = `${output.stdout}${String(chunk)}`.slice(-8_000);
  });
  return { child, label: options.label, output };
}

async function stopProcess(processHandle) {
  if (processHandle === null || processHandle.child.exitCode !== null) {
    return;
  }
  const gracefulExit = once(processHandle.child, "exit");
  processHandle.child.kill("SIGTERM");
  const exitedGracefully = await Promise.race([
    gracefulExit.then(() => true),
    delay(5_000).then(() => false),
  ]);
  if (exitedGracefully) {
    return;
  }
  const forcedExit = once(processHandle.child, "exit");
  processHandle.child.kill("SIGKILL");
  const exitedForcibly = await Promise.race([
    forcedExit.then(() => true),
    delay(2_000).then(() => false),
  ]);
  if (!exitedForcibly) {
    throw new Error(
      `${processHandle.label} process ${String(processHandle.child.pid)} did not terminate.`,
    );
  }
}

async function reserveLoopbackPort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen({ host: "127.0.0.1", port: 0 }, () => {
      const address = server.address();
      if (typeof address !== "object" || address === null) {
        server.close(() => reject(new Error("Unable to reserve a loopback port.")));
        return;
      }
      server.close((error) => {
        if (error) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
  });
}

async function waitForHttp(processHandle, origin, description) {
  const deadline = Date.now() + productionTimeoutMs;
  while (Date.now() < deadline) {
    if (processHandle.child.exitCode !== null) {
      throw new Error(
        `${processHandle.label} exited with ${String(processHandle.child.exitCode)} while waiting for ${description}.\n${processHandle.output.stderr || processHandle.output.stdout}`,
      );
    }
    try {
      const response = await fetch(origin);
      if (response.ok) {
        return;
      }
    } catch (error) {
      if (!(error instanceof TypeError)) {
        throw error;
      }
    }
    await delay(100);
  }
  throw new Error(`${description} did not become ready within 30 seconds.`);
}

function chromeBinaryPath() {
  const explicitPath = process.env.PYTHON_CANVAS_CHROME_BINARY;
  if (explicitPath !== undefined && explicitPath !== "") {
    if (!path.isAbsolute(explicitPath) || !existsSync(explicitPath)) {
      throw new Error(
        "PYTHON_CANVAS_CHROME_BINARY must name an existing absolute Chrome path.",
      );
    }
    return explicitPath;
  }
  if (!existsSync(chromeDefaultPath)) {
    throw new Error(
      "Chrome is required for the Python Canvas browser suite. Set PYTHON_CANVAS_CHROME_BINARY to an absolute executable path.",
    );
  }
  return chromeDefaultPath;
}

function startHeadlessChrome() {
  const profileDirectory = mkdtempSync(
    path.join(os.tmpdir(), "setta-python-canvas-chrome-"),
  );
  const browser = startProcess(
    chromeBinaryPath(),
    [
      "--headless=new",
      "--disable-background-timer-throttling",
      "--disable-backgrounding-occluded-windows",
      "--disable-extensions",
      "--disable-renderer-backgrounding",
      "--no-default-browser-check",
      "--no-first-run",
      "--remote-debugging-port=0",
      `--user-data-dir=${profileDirectory}`,
      "about:blank",
    ],
    { cwd: appRoot, label: "Headless Chrome" },
  );
  return { ...browser, profileDirectory };
}

async function waitForHeadlessChrome(browser) {
  const portFile = path.join(browser.profileDirectory, "DevToolsActivePort");
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (browser.child.exitCode !== null) {
      throw new Error(
        `Headless Chrome exited with ${String(browser.child.exitCode)}.\n${browser.output.stderr || browser.output.stdout}`,
      );
    }
    if (existsSync(portFile)) {
      const [rawPort] = readFileSync(portFile, "utf8").split("\n");
      const port = Number(rawPort);
      if (Number.isInteger(port) && port > 0 && port <= 65_535) {
        return port;
      }
      throw new Error(`Headless Chrome wrote an invalid DevTools port: ${rawPort}.`);
    }
    await delay(50);
  }
  throw new Error("Headless Chrome did not expose a DevTools port within 15 seconds.");
}

async function stopHeadlessChrome(browser) {
  try {
    await stopProcess(browser);
  } finally {
    rmSync(browser.profileDirectory, { force: true, recursive: true });
  }
}

async function evaluate(client, expression) {
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

async function waitFor(client, description, expression) {
  const deadline = Date.now() + productionTimeoutMs;
  while (Date.now() < deadline) {
    const result = await evaluate(client, expression);
    if (result) {
      return result;
    }
    await delay(100);
  }
  throw new Error(`${description} did not occur within 30 seconds.`);
}

function textBoxSelector(label) {
  return `[role="textbox"][aria-label=${JSON.stringify(label)}]`;
}

function labeledSelector(label) {
  return `[aria-label=${JSON.stringify(label)}]`;
}

async function activateTextBox(client, label) {
  const selector = textBoxSelector(label);
  const found = await evaluate(
    client,
    `(() => {
      const control = document.querySelector(${JSON.stringify(selector)});
      if (!(control instanceof HTMLElement)) {
        return false;
      }
      control.focus({ preventScroll: true });
      return true;
    })()`,
  );
  if (!found) {
    throw new Error(`Accessible text box ${JSON.stringify(label)} was not found.`);
  }
  await waitFor(
    client,
    `live ${label} editor activation`,
    `(() => {
      const control = document.querySelector(${JSON.stringify(labeledSelector(label))});
      return control instanceof HTMLElement && control.getAttribute("contenteditable") === "true";
    })()`,
  );
  await evaluate(
    client,
    `(() => {
      const control = document.querySelector(${JSON.stringify(labeledSelector(label))});
      if (!(control instanceof HTMLElement)) {
        return false;
      }
      control.focus({ preventScroll: true });
      return document.activeElement === control;
    })()`,
  );
}

async function insertText(client, value) {
  await client.send("Input.insertText", { text: value });
}

async function pressEnter(client) {
  const params = {
    code: "Enter",
    key: "Enter",
    nativeVirtualKeyCode: 13,
    windowsVirtualKeyCode: 13,
  };
  await client.send("Input.dispatchKeyEvent", { ...params, type: "keyDown" });
  await client.send("Input.dispatchKeyEvent", { ...params, type: "keyUp" });
}

async function selectAll(client) {
  const isMac = process.platform === "darwin";
  const modifier = isMac ? 4 : 2;
  const modifierKey = isMac ? "Meta" : "Control";
  await client.send("Input.dispatchKeyEvent", {
    code: modifierKey,
    key: modifierKey,
    type: "keyDown",
  });
  await client.send("Input.dispatchKeyEvent", {
    code: "KeyA",
    key: "a",
    modifiers: modifier,
    type: "keyDown",
    windowsVirtualKeyCode: 65,
  });
  await client.send("Input.dispatchKeyEvent", {
    code: "KeyA",
    key: "a",
    modifiers: modifier,
    type: "keyUp",
    windowsVirtualKeyCode: 65,
  });
  await client.send("Input.dispatchKeyEvent", {
    code: modifierKey,
    key: modifierKey,
    type: "keyUp",
  });
}

async function navigate(client, origin) {
  const loaded = client.waitForEvent("Page.loadEventFired", 15_000);
  await client.send("Page.navigate", { url: origin });
  await loaded;
}

async function runWalkthrough(client) {
  const callableLabel = "Callable expression";
  const parameterLabel = "x expression";
  const generatedLabel = "Generated Python code editor";

  await waitFor(
    client,
    "Python Canvas accessible controls",
    `(() => {
      const callable = document.querySelector(${JSON.stringify(textBoxSelector(callableLabel))});
      const generated = document.querySelector(${JSON.stringify(labeledSelector(generatedLabel))});
      const canvas = document.querySelector('[role="region"][aria-label="Workspace canvas"]');
      return callable instanceof HTMLElement && generated instanceof HTMLElement && canvas instanceof HTMLElement;
    })()`,
  );

  const generatedEditor = await evaluate(
    client,
    `(() => {
      const generated = document.querySelector(${JSON.stringify(labeledSelector(generatedLabel))});
      const editor = generated?.querySelector('[role="textbox"]');
      if (!(editor instanceof HTMLElement)) {
        return null;
      }
      return {
        source: editor.textContent,
        isReadOnly: editor.getAttribute("aria-readonly") === "true",
      };
    })()`,
  );
  if (generatedEditor === null || !generatedEditor.isReadOnly) {
    throw new Error("Generated Python editor must be read-only.");
  }
  const generatedEditorFocused = await evaluate(
    client,
    `(() => {
      const generated = document.querySelector(${JSON.stringify(labeledSelector(generatedLabel))});
      const editor = generated?.querySelector('[role="textbox"]');
      if (!(editor instanceof HTMLElement)) {
        return false;
      }
      editor.focus({ preventScroll: true });
      return document.activeElement === editor;
    })()`,
  );
  if (!generatedEditorFocused) {
    throw new Error("Generated Python editor could not receive keyboard focus.");
  }
  await insertText(client, "attempted_mutation");
  await delay(100);
  const generatedSourceDidNotChange = await evaluate(
    client,
    `(() => {
      const generated = document.querySelector(${JSON.stringify(labeledSelector(generatedLabel))});
      const editor = generated?.querySelector('[role="textbox"]');
      return editor?.textContent === ${JSON.stringify(generatedEditor.source)};
    })()`,
  );
  if (!generatedSourceDidNotChange) {
    throw new Error("Generated Python editor accepted an authored mutation.");
  }

  await activateTextBox(client, callableLabel);
  await insertText(client, "math.sqrt");
  await pressEnter(client);

  await waitFor(
    client,
    "math.sqrt callable projection",
    `(() => {
      const parameter = document.querySelector(${JSON.stringify(textBoxSelector(parameterLabel))});
      const generated = document.querySelector(${JSON.stringify(labeledSelector(generatedLabel))});
      return parameter instanceof HTMLElement && generated?.textContent?.includes("state.Square_Root = math.sqrt()") === true;
    })()`,
  );

  await activateTextBox(client, parameterLabel);
  await insertText(client, "missing_value");
  await waitFor(
    client,
    "mapped undefined-name diagnostic",
    `(() => {
      const generated = document.querySelector(${JSON.stringify(labeledSelector(generatedLabel))});
      const diagnostic = Array.from(document.querySelectorAll('[role="status"]')).some((element) =>
        element.textContent?.includes("Parameter diagnostics available."),
      );
      return generated?.textContent?.includes("state.Square_Root__x = missing_value") === true && diagnostic;
    })()`,
  );

  await selectAll(client);
  await insertText(client, "3");
  await waitFor(
    client,
    "cleared parameter diagnostic",
    `(() => {
      const generated = document.querySelector(${JSON.stringify(labeledSelector(generatedLabel))});
      const cleared = Array.from(document.querySelectorAll('[role="status"]')).some((element) =>
        element.textContent?.includes("Parameter diagnostics cleared."),
      );
      return generated?.textContent?.includes("state.Square_Root__x = 3") === true &&
        generated?.textContent?.includes("missing_value") === false && cleared;
    })()`,
  );
}

async function main() {
  run("pnpm", ["run", "build"], { cwd: appRoot });

  const temporaryDirectory = mkdtempSync(
    path.join(os.tmpdir(), "setta-python-canvas-browser-"),
  );
  let backend = null;
  let preview = null;
  let browser = null;
  let client = null;
  try {
    const backendPort = await reserveLoopbackPort();
    const previewPort = await reserveLoopbackPort();
    const backendOrigin = `http://127.0.0.1:${String(backendPort)}`;
    const previewOrigin = `http://127.0.0.1:${String(previewPort)}`;
    const backendBinary = path.join(temporaryDirectory, "python-canvas");
    run("go", ["build", "-o", backendBinary, "./cmd/python-canvas"], {
      cwd: backendRoot,
    });

    backend = startProcess(backendBinary, ["-port", String(backendPort)], {
      cwd: appRoot,
      label: "Python Canvas backend",
    });
    await waitForHttp(backend, `${backendOrigin}/api/v1/project`, "Python Canvas backend");

    preview = startProcess(
      process.execPath,
      [
        path.join(appRoot, "node_modules/vite/bin/vite.js"),
        "preview",
        "--host",
        "127.0.0.1",
        "--port",
        String(previewPort),
        "--strictPort",
      ],
      {
        cwd: appRoot,
        env: { PYTHON_CANVAS_BACKEND_ORIGIN: backendOrigin },
        label: "Python Canvas production preview",
      },
    );
    await waitForHttp(preview, previewOrigin, "Python Canvas production preview");

    browser = startHeadlessChrome();
    const cdpPort = await waitForHeadlessChrome(browser);
    const page = await createCdpPage(cdpPort);
    client = page.client;
    await Promise.all([
      client.send("Page.enable"),
      client.send("Runtime.enable"),
      client.send("Emulation.setDeviceMetricsOverride", {
        deviceScaleFactor: 1,
        height: 900,
        mobile: false,
        width: 1_440,
      }),
    ]);
    await navigate(client, previewOrigin);
    await runWalkthrough(client);
    console.log("Python Canvas browser vertical slice passed.");
  } finally {
    client?.close();
    try {
      if (browser !== null) {
        await stopHeadlessChrome(browser);
      }
    } finally {
      try {
        await stopProcess(preview);
      } finally {
        try {
          await stopProcess(backend);
        } finally {
          rmSync(temporaryDirectory, { force: true, recursive: true });
        }
      }
    }
  }
}

await main();
