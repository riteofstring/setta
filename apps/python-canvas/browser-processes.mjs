import { spawn } from "node:child_process";
import { once } from "node:events";
import {
  accessSync,
  constants,
  existsSync,
  lstatSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createServer } from "node:net";
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
const playwrightCacheRoot = path.join(
  os.homedir(),
  "Library",
  "Caches",
  "ms-playwright",
);
const playwrightHeadlessShellRelativePath = path.join(
  "chrome-headless-shell-mac-arm64",
  "chrome-headless-shell",
);
const playwrightHeadlessShellDirectoryPattern =
  /^chromium_headless_shell-([0-9]+)$/u;
export const productionTimeoutMs = 30_000;
const productionViewport = {
  deviceScaleFactor: 1,
  height: 900,
  width: 1_440,
};

function startProcess(command, arguments_, options) {
  const child = spawn(command, arguments_, {
    cwd: options.cwd,
    detached: options.ownsProcessGroup === true,
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
  return {
    child,
    label: options.label,
    output,
    ownsProcessGroup: options.ownsProcessGroup === true,
  };
}

function signalProcess(processHandle, signal) {
  if (
    processHandle.ownsProcessGroup &&
    process.platform !== "win32" &&
    processHandle.child.pid !== undefined
  ) {
    try {
      process.kill(-processHandle.child.pid, signal);
      return;
    } catch (error) {
      if (error && typeof error === "object" && error.code === "ESRCH") {
        return;
      }
      throw error;
    }
  }
  processHandle.child.kill(signal);
}

async function stopProcess(processHandle) {
  if (processHandle === null || processHandle.child.exitCode !== null) {
    return;
  }
  const gracefulExit = once(processHandle.child, "exit");
  signalProcess(processHandle, "SIGTERM");
  if (
    await Promise.race([
      gracefulExit.then(() => true),
      delay(5_000).then(() => false),
    ])
  ) {
    return;
  }
  const forcedExit = once(processHandle.child, "exit");
  signalProcess(processHandle, "SIGKILL");
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

function isExecutableRegularFile(filePath) {
  try {
    accessSync(filePath, constants.X_OK);
    return lstatSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isMacOSGuiApplicationPath(filePath) {
  return /(?:^|\/)[^/]+\.app\/Contents\/MacOS(?:\/|$)/iu.test(
    path.normalize(filePath),
  );
}

function compareNumericRevisions(left, right) {
  const normalizedLeft = left.replace(/^0+(?=[0-9])/u, "");
  const normalizedRight = right.replace(/^0+(?=[0-9])/u, "");
  if (normalizedLeft.length !== normalizedRight.length) {
    return normalizedLeft.length > normalizedRight.length ? 1 : -1;
  }
  if (normalizedLeft === normalizedRight) {
    return 0;
  }
  return normalizedLeft > normalizedRight ? 1 : -1;
}

function isUnavailablePlaywrightCacheError(error) {
  return (
    error !== null &&
    typeof error === "object" &&
    "code" in error &&
    ["EACCES", "ENOENT", "ENOTDIR"].includes(error.code)
  );
}

function readPlaywrightCacheDirectoryEntries(cacheRoot) {
  if (!path.isAbsolute(cacheRoot)) {
    return null;
  }
  try {
    return readdirSync(cacheRoot, { withFileTypes: true });
  } catch (error) {
    if (isUnavailablePlaywrightCacheError(error)) {
      return null;
    }
    throw error;
  }
}

function headlessShellCandidate(cacheRoot, directoryEntry) {
  const match = playwrightHeadlessShellDirectoryPattern.exec(
    directoryEntry.name,
  );
  if (!directoryEntry.isDirectory() || match === null) {
    return null;
  }
  const shellPath = path.join(
    cacheRoot,
    directoryEntry.name,
    playwrightHeadlessShellRelativePath,
  );
  if (!isExecutableRegularFile(shellPath)) {
    return null;
  }
  return {
    directoryName: directoryEntry.name,
    path: shellPath,
    revision: match[1],
  };
}

function isPreferredHeadlessShellCandidate(highestCandidate, candidate) {
  if (highestCandidate === null) {
    return true;
  }
  const revisionComparison = compareNumericRevisions(
    candidate.revision,
    highestCandidate.revision,
  );
  if (revisionComparison !== 0) {
    return revisionComparison > 0;
  }
  return candidate.directoryName > highestCandidate.directoryName;
}

function findPlaywrightHeadlessShell(cacheRoot) {
  const directoryEntries = readPlaywrightCacheDirectoryEntries(cacheRoot);
  if (directoryEntries === null) {
    return null;
  }

  let highestCandidate = null;
  for (const directoryEntry of directoryEntries) {
    const candidate = headlessShellCandidate(cacheRoot, directoryEntry);
    if (
      candidate !== null &&
      isPreferredHeadlessShellCandidate(highestCandidate, candidate)
    ) {
      highestCandidate = candidate;
    }
  }
  return highestCandidate;
}

function missingHeadlessChromeError(cacheRoot, platform) {
  if (platform === "darwin") {
    return new Error(
      `Python Canvas browser suite requires a valid absolute PYTHON_CANVAS_CHROME_BINARY or a regular executable Playwright raw headless shell at ${path.join(cacheRoot, "chromium_headless_shell-<numeric revision>", playwrightHeadlessShellRelativePath)}.`,
    );
  }
  return new Error(
    "Python Canvas browser suite requires PYTHON_CANVAS_CHROME_BINARY to name an existing absolute executable path.",
  );
}

function explicitHeadlessChromeBinary(environment, platform) {
  const explicitPath = environment.PYTHON_CANVAS_CHROME_BINARY;
  if (typeof explicitPath !== "string" || explicitPath === "") {
    return null;
  }
  if (platform === "darwin" && isMacOSGuiApplicationPath(explicitPath)) {
    throw new Error(
      "PYTHON_CANVAS_CHROME_BINARY must name a raw chrome-headless-shell executable on macOS; GUI application executable paths are not supported.",
    );
  }
  if (
    !path.isAbsolute(explicitPath) ||
    !isExecutableRegularFile(explicitPath)
  ) {
    throw new Error(
      "PYTHON_CANVAS_CHROME_BINARY must name an existing absolute executable path.",
    );
  }
  return { path: explicitPath, source: "PYTHON_CANVAS_CHROME_BINARY" };
}

function cachedHeadlessChromeBinary(platform, cacheRoot) {
  if (platform !== "darwin") {
    return null;
  }
  const cachedHeadlessShell = findPlaywrightHeadlessShell(cacheRoot);
  if (cachedHeadlessShell === null) {
    return null;
  }
  return {
    path: cachedHeadlessShell.path,
    source: `Playwright cache revision ${cachedHeadlessShell.revision}`,
  };
}

export function resolveHeadlessChromeBinary({
  environment = process.env,
  platform = process.platform,
  cacheRoot = playwrightCacheRoot,
} = {}) {
  const explicitBinary = explicitHeadlessChromeBinary(environment, platform);
  if (explicitBinary !== null) {
    return explicitBinary;
  }
  const cachedBinary = cachedHeadlessChromeBinary(platform, cacheRoot);
  if (cachedBinary !== null) {
    return cachedBinary;
  }
  throw missingHeadlessChromeError(cacheRoot, platform);
}

export function headlessChromeArguments(profileDirectory) {
  // Keep the disposable profile away from desktop credentials and prevent
  // command-heavy CDP polling from being throttled as renderer IPC flooding.
  return [
    "--headless=new",
    "--allow-pre-commit-input",
    "--disable-backgrounding-occluded-windows",
    "--disable-background-timer-throttling",
    "--disable-component-extensions-with-background-pages",
    "--disable-default-apps",
    "--disable-extensions",
    "--disable-hang-monitor",
    "--disable-ipc-flooding-protection",
    "--disable-renderer-backgrounding",
    "--no-default-browser-check",
    "--no-first-run",
    "--no-service-autorun",
    "--mute-audio",
    "--password-store=basic",
    "--remote-debugging-port=0",
    "--use-mock-keychain",
    `--user-data-dir=${profileDirectory}`,
    "about:blank",
  ];
}

function startHeadlessChrome() {
  const profileDirectory = mkdtempSync(
    path.join(os.tmpdir(), "setta-python-canvas-chrome-"),
  );
  const chromeBinary = resolveHeadlessChromeBinary();
  process.stdout.write(
    `Python Canvas headless Chrome source=${chromeBinary.source} path=${chromeBinary.path}\n`,
  );
  const browser = startProcess(
    chromeBinary.path,
    headlessChromeArguments(profileDirectory),
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

export function launcherArguments(projectPath, create, ports) {
  const arguments_ = [
    "--project",
    projectPath,
    "--backend-port",
    String(ports.backendPort),
    "--preview-port",
    String(ports.previewPort),
  ];
  if (create) {
    arguments_.push("--create");
  }
  return arguments_;
}

function startLauncher(projectPath, create, ports) {
  return startProcess(
    launcherPath,
    launcherArguments(projectPath, create, ports),
    {
      cwd: repositoryRoot,
      label: "Python Canvas launcher",
      ownsProcessGroup: true,
    },
  );
}

export async function waitForLauncher(
  launcher,
  backendOrigin = "http://127.0.0.1:8080",
  previewOrigin = "http://127.0.0.1:5173",
) {
  await waitForHttp(
    launcher,
    `${backendOrigin}/api/v2/project`,
    "Python Canvas backend",
  );
  await waitForHttp(
    launcher,
    previewOrigin,
    "Python Canvas Vite production preview",
  );
}

function allocateLoopbackPort() {
  return new Promise((resolve, reject) => {
    const listener = createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const address = listener.address();
      if (address === null || typeof address === "string") {
        listener.close(() => {
          reject(new Error("Loopback port allocation did not expose a TCP port."));
        });
        return;
      }
      listener.close((error) => {
        if (error !== undefined) {
          reject(error);
          return;
        }
        resolve(address.port);
      });
    });
  });
}

async function allocateLoopbackPorts() {
  const backendPort = await allocateLoopbackPort();
  let previewPort = await allocateLoopbackPort();
  while (previewPort === backendPort) {
    previewPort = await allocateLoopbackPort();
  }
  return { backendPort, previewPort };
}

// This is the one checked-in browser lifecycle: an absent, temporary project
// is created through the public launcher, and a later restart reopens the same
// path without --create. The walkthrough owns only public HTTP and browser
// surfaces; it never injects a project into an in-memory backend.
export async function runAgainstProductionApp(callback) {
  const ports = await allocateLoopbackPorts();
  const temporaryDirectory = mkdtempSync(
    path.join(os.tmpdir(), "setta-python-canvas-browser-"),
  );
  const projectPath = path.join(temporaryDirectory, "project.json");
  const fixtureModulePath = path.join(temporaryDirectory, "fixture_module.py");
  writeFileSync(
    fixtureModulePath,
    "def sample(first: float, /, second: int = 1, *values: str, keyword: str = 'value', **extras: object) -> float:\n    return first + second\n\n\ndef zero() -> None:\n    return None\n",
    "utf8",
  );

  let launcher = null;
  let browser = null;
  let client = null;
  const backendOrigin = `http://127.0.0.1:${String(ports.backendPort)}`;
  const previewOrigin = `http://127.0.0.1:${String(ports.previewPort)}`;
  const launch = async (create) => {
    launcher = startLauncher(projectPath, create, ports);
    await waitForLauncher(launcher, backendOrigin, previewOrigin);
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
