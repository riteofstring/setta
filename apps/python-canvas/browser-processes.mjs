import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { createCdpPage } from "../../scripts/lib/cdp-client.mjs";

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(appRoot, "../..");
const launcherPath = path.join(
  repositoryRoot,
  "scripts",
  "run-python-canvas.sh",
);
const chromeDefaultPath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";

export const productionTimeoutMs = 30_000;
const productionViewport = {
  deviceScaleFactor: 1,
  height: 900,
  width: 1_440,
};

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
  if (
    await Promise.race([
      gracefulExit.then(() => true),
      delay(5_000).then(() => false),
    ])
  ) {
    return;
  }
  const forcedExit = once(processHandle.child, "exit");
  processHandle.child.kill("SIGKILL");
  if (
    !(await Promise.race([
      forcedExit.then(() => true),
      delay(2_000).then(() => false),
    ]))
  ) {
    throw new Error(
      `${processHandle.label} process ${String(processHandle.child.pid)} did not terminate.`,
    );
  }
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

export async function fetchCanonicalSnapshot(backendOrigin) {
  const response = await fetch(`${backendOrigin}/api/v2/project`);
  if (!response.ok) {
    throw new Error(
      `Canonical project snapshot request failed with ${String(response.status)}.`,
    );
  }
  return response.json();
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
      "--disable-extensions",
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
      throw new Error(
        `Headless Chrome wrote an invalid DevTools port: ${rawPort}.`,
      );
    }
    await delay(50);
  }
  throw new Error(
    "Headless Chrome did not expose a DevTools port within 15 seconds.",
  );
}

async function stopHeadlessChrome(browser) {
  try {
    await stopProcess(browser);
  } finally {
    rmSync(browser.profileDirectory, { force: true, recursive: true });
  }
}

function startLauncher(projectPath, create) {
  const arguments_ = ["--project", projectPath];
  if (create) {
    arguments_.push("--create");
  }
  return startProcess(launcherPath, arguments_, {
    cwd: repositoryRoot,
    label: "Python Canvas launcher",
  });
}

async function waitForLauncher(launcher) {
  await waitForHttp(
    launcher,
    "http://127.0.0.1:8080/api/v2/project",
    "Python Canvas backend",
  );
  await waitForHttp(
    launcher,
    "http://127.0.0.1:5173",
    "Python Canvas frontend",
  );
}

// This is the one checked-in browser lifecycle: an absent, temporary project
// is created through the public launcher, and a later restart reopens the same
// path without --create. The walkthrough owns only public HTTP and browser
// surfaces; it never injects a project into an in-memory backend.
export async function runAgainstProductionApp(callback) {
  const temporaryDirectory = mkdtempSync(
    path.join(os.tmpdir(), "setta-python-canvas-browser-"),
  );
  const projectPath = path.join(temporaryDirectory, "project.json");
  const fixtureModulePath = path.join(temporaryDirectory, "fixture_module.py");
  writeFileSync(
    fixtureModulePath,
    "def sample(value: float, *, scale: int = 1) -> float:\n    return value * scale\n",
    "utf8",
  );

  let launcher = null;
  let browser = null;
  let client = null;
  const backendOrigin = "http://127.0.0.1:8080";
  const previewOrigin = "http://127.0.0.1:5173";
  const launch = async (create) => {
    launcher = startLauncher(projectPath, create);
    await waitForLauncher(launcher);
  };
  const restart = async () => {
    await stopProcess(launcher);
    await launch(false);
  };

  try {
    await launch(true);
    browser = startHeadlessChrome();
    const cdpPort = await waitForHeadlessChrome(browser);
    const page = await createCdpPage(cdpPort);
    client = page.client;
    await client.send("Page.bringToFront");
    await Promise.all([
      client.send("Page.enable"),
      client.send("Runtime.enable"),
      client.send("Emulation.setDeviceMetricsOverride", {
        ...productionViewport,
        mobile: false,
      }),
    ]);
    await callback({
      backendOrigin,
      client,
      fixtureModulePath,
      previewOrigin,
      projectPath,
      restart,
    });
  } finally {
    client?.close();
    try {
      if (browser !== null) {
        await stopHeadlessChrome(browser);
      }
    } finally {
      try {
        await stopProcess(launcher);
      } finally {
        rmSync(temporaryDirectory, { force: true, recursive: true });
      }
    }
  }
}
