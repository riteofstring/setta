import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { createCdpPage } from "../../scripts/lib/cdp-client.mjs";

// The process side of everything this app drives in production: the repository commands it runs,
// the backend and Vite servers it starts and stops, the loopback ports it reserves, and the
// headless Chrome it drives. None of it knows anything about the page under test.

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.join(appRoot, "backend");
const repositoryRoot = path.resolve(appRoot, "../..");
const chromeDefaultPath =
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
export const productionTimeoutMs = 30_000;
// The one surface every production check and capture is judged on: a fixed 1440x900 CSS-pixel
// viewport at device scale 1.
export const productionViewport = {
  deviceScaleFactor: 1,
  height: 900,
  width: 1_440,
};

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

// The exact commit a recording came from. A capture of modified tracked files would name a source
// nobody can check out again, so this refuses one instead of recording a commit it does not match.
export function readCommittedSource() {
  const status = spawnSync(
    "git",
    ["status", "--porcelain", "--untracked-files=no"],
    {
      cwd: repositoryRoot,
      encoding: "utf8",
    },
  );
  if (status.status !== 0) {
    throw new Error(`git status failed: ${status.stderr || status.stdout}`);
  }
  if (status.stdout.trim() !== "") {
    throw new Error(
      `Recording requires a committed source tree. These tracked files differ from HEAD:\n${status.stdout.trim()}`,
    );
  }
  const revision = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: repositoryRoot,
    encoding: "utf8",
  });
  if (revision.status !== 0) {
    throw new Error(`git rev-parse failed: ${revision.stderr}`);
  }
  return revision.stdout.trim();
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
        server.close(() =>
          reject(new Error("Unable to reserve a loopback port.")),
        );
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

export async function fetchCanonicalSnapshot(backendOrigin) {
  const response = await fetch(`${backendOrigin}/api/v1/project`);
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

// The production surface itself: fresh package and application builds, the real Go service and its
// pinned Basedpyright, the Vite preview that serves the built application, and headless Chrome on
// the production viewport. Every production check and capture runs against exactly this surface,
// and it is torn down in reverse order whatever the caller does.
export async function runAgainstProductionApp(callback) {
  run("pnpm", ["--filter", "@setta/workspace", "run", "build"]);
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
    await waitForHttp(
      backend,
      `${backendOrigin}/api/v1/project`,
      "Python Canvas backend",
    );

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
    await waitForHttp(
      preview,
      previewOrigin,
      "Python Canvas production preview",
    );

    browser = startHeadlessChrome();
    const cdpPort = await waitForHeadlessChrome(browser);
    const page = await createCdpPage(cdpPort);
    client = page.client;
    // Chrome starts with its initial about:blank target as well as the fresh target the CDP helper
    // creates. Make the latter foreground before a walkthrough relies on animation frames.
    await client.send("Page.bringToFront");
    await Promise.all([
      client.send("Page.enable"),
      client.send("Runtime.enable"),
      client.send("Emulation.setDeviceMetricsOverride", {
        ...productionViewport,
        mobile: false,
      }),
    ]);
    await callback({ backendOrigin, client, previewOrigin });
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
