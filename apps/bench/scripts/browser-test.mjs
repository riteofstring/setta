import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { createCdpPage } from "../../../scripts/lib/cdp-client.mjs";
import {
  startHeadlessChrome,
  stopHeadlessChrome,
  waitForHeadlessChrome,
} from "../../../scripts/lib/headless-chrome.mjs";

const scriptRoot = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(scriptRoot, "..");
const repositoryRoot = path.resolve(appRoot, "../..");
const backendRoot = path.join(appRoot, "backend");
const exampleRoot = path.join(appRoot, "examples", "product-thumbnails");
const timeoutMilliseconds = 60_000;

function runCommand(command, arguments_, cwd, env = process.env) {
  const result = spawnSync(command, arguments_, {
    cwd,
    encoding: "utf8",
    env,
    stdio: "inherit",
  });
  if (result.error !== undefined) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${arguments_.join(" ")} exited with ${String(result.status)}.`,
    );
  }
}

function lockedCodePolishyRelease() {
  const lock = JSON.parse(
    readFileSync(path.join(repositoryRoot, ".code-polishy.lock.json"), "utf8"),
  );
  if (
    typeof lock.codePolishyVersion !== "string" ||
    typeof lock.releaseDigest !== "string"
  ) {
    throw new Error("Bench browser acceptance found an invalid tool lock.");
  }
  return `${lock.codePolishyVersion}-${lock.releaseDigest}`;
}

function pinnedGoPlatform() {
  const platform = {
    darwin: "darwin",
    linux: "linux",
    win32: "windows",
  }[process.platform];
  const architecture = { arm64: "arm64", x64: "amd64" }[process.arch];
  if (platform === undefined || architecture === undefined) {
    throw new Error("Bench browser acceptance cannot resolve pinned Go.");
  }
  return `${platform}-${architecture}`;
}

function codePolishyPrefixes() {
  const prefixes = [path.join(os.homedir(), ".local", "share", "code-polishy")];
  if (process.platform === "win32" && process.env.LOCALAPPDATA !== undefined) {
    prefixes.unshift(path.join(process.env.LOCALAPPDATA, "CodePolishy"));
  }
  const locator = spawnSync(
    process.platform === "win32" ? "where.exe" : "which",
    ["code-polishy"],
    { encoding: "utf8" },
  );
  const launcher = locator.stdout
    ?.split(/\r?\n/u)
    .find((value) => value !== "");
  if (locator.status === 0 && launcher !== undefined) {
    prefixes.unshift(path.resolve(path.dirname(realpathSync(launcher)), ".."));
  }
  return prefixes;
}

function resolvePinnedGo() {
  const executable = process.platform === "win32" ? "go.exe" : "go";
  for (const prefix of codePolishyPrefixes()) {
    const candidate = path.join(
      prefix,
      "releases",
      lockedCodePolishyRelease(),
      ".tools",
      "go",
      pinnedGoPlatform(),
      "go",
      "bin",
      executable,
    );
    if (existsSync(candidate)) return candidate;
  }
  throw new Error("Bench browser acceptance could not find pinned Go.");
}

function buildSurface(go, benchBinary, candidateBinary) {
  const buildEnvironment = {
    ...process.env,
    PATH: `${path.dirname(go)}${path.delimiter}${process.env.PATH ?? ""}`,
  };
  if (!process.argv.includes("--skip-build")) {
    runCommand(
      process.platform === "win32" ? "pnpm.cmd" : "pnpm",
      ["--filter", "@setta/bench", "run", "build"],
      repositoryRoot,
      buildEnvironment,
    );
  }
  runCommand(go, ["build", "-o", benchBinary, "./cmd/bench"], backendRoot);
  runCommand(
    go,
    ["build", "-o", candidateBinary, "./main.go"],
    path.join(exampleRoot, "candidate"),
  );
}

function startServer(binaryPath, projectRoot, executableDirectory) {
  const nonce = `browser-${process.pid.toString(36)}`;
  const child = spawn(
    binaryPath,
    [
      "serve",
      "--project-root",
      projectRoot,
      "--create=false",
      "--web-root",
      path.join(appRoot, "dist"),
      "--session-nonce",
      nonce,
      "--supervised-stdin=true",
      "--port",
      "0",
    ],
    {
      cwd: projectRoot,
      detached: process.platform !== "win32",
      env: {
        ...process.env,
        PATH: `${executableDirectory}${path.delimiter}${process.env.PATH ?? ""}`,
      },
      stdio: ["pipe", "pipe", "pipe"],
    },
  );
  const output = { stderr: "", stdout: "" };
  child.stderr.on("data", (chunk) => {
    output.stderr = `${output.stderr}${String(chunk)}`.slice(-8_000);
  });
  child.stdout.on("data", (chunk) => {
    output.stdout = `${output.stdout}${String(chunk)}`.slice(-8_000);
  });
  child.stdin.on("error", () => {});
  return { child, nonce, output, projectRoot };
}

async function waitForServer(server) {
  const deadline = Date.now() + timeoutMilliseconds;
  let readiness = null;
  while (Date.now() < deadline) {
    assertServerRunning(server);
    if (readiness === null) readiness = readServerReadiness(server);
    if (readiness !== null && (await readinessEndpointResponds(readiness))) {
      return readiness.url;
    }
    await delay(50);
  }
  throw new Error("Bench host did not publish readiness within 60 seconds.");
}

function assertServerRunning(server) {
  if (server.child.exitCode === null) return;
  throw new Error(
    `Bench host exited with ${String(server.child.exitCode)}.\n${server.output.stderr || server.output.stdout}`,
  );
}

function readServerReadiness(server) {
  const lineEnd = server.output.stdout.indexOf("\n");
  if (lineEnd < 0) return null;
  const readiness = JSON.parse(server.output.stdout.slice(0, lineEnd));
  assert.equal(readiness.app, "bench");
  assert.equal(readiness.nonce, server.nonce);
  assert.equal(
    realpathSync(readiness.project),
    realpathSync(server.projectRoot),
  );
  assert.match(readiness.url, /^http:\/\/127\.0\.0\.1:[0-9]+$/u);
  return readiness;
}

function isTransientReadinessError(error) {
  return error instanceof TypeError || error?.name === "TimeoutError";
}

async function readinessEndpointResponds(readiness) {
  try {
    const response = await fetch(`${readiness.url}/api/v1/runtime/session`, {
      signal: AbortSignal.timeout(1_000),
    });
    return response.ok;
  } catch (error) {
    if (isTransientReadinessError(error)) return false;
    throw error;
  }
}

async function waitForProcessExit(child, action, timeout) {
  if (child.exitCode !== null) return true;
  const exit = once(child, "exit");
  action();
  if (child.exitCode !== null) return true;
  return Promise.race([
    exit.then(() => true),
    delay(timeout).then(() => false),
  ]);
}

function signalServerTree(server, signal) {
  const processId = server.child.pid;
  if (processId === undefined) return;
  if (process.platform === "win32") {
    if (signal === "SIGKILL") {
      spawnSync("taskkill.exe", ["/PID", String(processId), "/T", "/F"]);
    } else {
      server.child.kill(signal);
    }
    return;
  }
  try {
    process.kill(-processId, signal);
  } catch (error) {
    if (!(error && typeof error === "object" && error.code === "ESRCH")) {
      throw error;
    }
  }
}

async function stopServer(server) {
  if (server === null || server.child.exitCode !== null) return;
  if (
    await waitForProcessExit(
      server.child,
      () => server.child.stdin.end(),
      5_000,
    )
  ) {
    return;
  }
  if (
    await waitForProcessExit(
      server.child,
      () => signalServerTree(server, "SIGTERM"),
      2_000,
    )
  ) {
    return;
  }
  if (
    !(await waitForProcessExit(
      server.child,
      () => signalServerTree(server, "SIGKILL"),
      2_000,
    ))
  ) {
    throw new Error(
      `Bench host process ${String(server.child.pid)} did not stop.`,
    );
  }
}

async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", {
    awaitPromise: true,
    expression,
    returnByValue: true,
  });
  if (response.exceptionDetails !== undefined) {
    throw new Error(
      response.exceptionDetails.exception?.description ??
        response.exceptionDetails.text,
    );
  }
  return response.result?.value;
}

async function waitFor(client, description, expression) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    if ((await evaluate(client, expression)) === true) return;
    await delay(75);
  }
  const observed = await evaluate(
    client,
    `({ body: document.body.textContent?.slice(0, 3000) ?? "", url: location.href })`,
  );
  throw new Error(
    `${description} did not occur within 60 seconds: ${JSON.stringify(observed)}`,
  );
}

async function clickButton(client, label) {
  const clicked = await evaluate(
    client,
    `(() => {
      const button = Array.from(document.querySelectorAll("button")).find(
        (candidate) =>
          !candidate.disabled &&
          (candidate.getAttribute("aria-label") === ${JSON.stringify(label)} ||
            candidate.textContent?.trim() === ${JSON.stringify(label)}),
      );
      if (!(button instanceof HTMLButtonElement)) return false;
      button.click();
      return true;
    })()`,
  );
  assert.equal(clicked, true, `${label} was not an enabled browser action.`);
}

async function clickSavedView(client, label) {
  const clicked = await evaluate(
    client,
    `(() => {
      const button = Array.from(document.querySelectorAll('[role="tab"]')).find(
        (candidate) => candidate.textContent?.trim() === ${JSON.stringify(label)},
      );
      if (!(button instanceof HTMLButtonElement) || button.disabled) return false;
      button.click();
      return true;
    })()`,
  );
  assert.equal(clicked, true, `${label} was not an enabled saved view.`);
}

async function jsonRequest(origin, pathname) {
  const response = await fetch(`${origin}${pathname}`, {
    headers: { Accept: "application/json", Origin: origin },
    signal: AbortSignal.timeout(timeoutMilliseconds),
  });
  const value = await response.json();
  if (!response.ok) {
    throw new Error(
      `${pathname} failed with ${String(response.status)}: ${JSON.stringify(value)}`,
    );
  }
  return value;
}

async function waitForSnapshot(origin, description, predicate) {
  const deadline = Date.now() + timeoutMilliseconds;
  let snapshot = null;
  while (Date.now() < deadline) {
    snapshot = await jsonRequest(origin, "/api/v1/snapshot");
    if (predicate(snapshot)) return snapshot;
    await delay(100);
  }
  throw new Error(
    `${description} did not occur within 60 seconds: ${JSON.stringify(snapshot)}`,
  );
}

function collectBrowserIssues(client) {
  const issues = [];
  client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
    issues.push(
      exceptionDetails.exception?.description ??
        exceptionDetails.text ??
        "Unknown browser exception",
    );
  });
  client.on("Runtime.consoleAPICalled", ({ args, type }) => {
    if (type === "error" || type === "assert") {
      issues.push(
        args
          .map((argument) => argument.value ?? argument.description ?? "")
          .join(" "),
      );
    }
  });
  return issues;
}

async function navigate(client, origin) {
  const loaded = client.waitForEvent(
    "Page.loadEventFired",
    timeoutMilliseconds,
  );
  await client.send("Page.navigate", { url: origin });
  await loaded;
  await waitFor(
    client,
    "the Workspace-native Bench shell",
    `document.querySelectorAll('[data-workspace-shell="true"]').length === 1 &&
      document.querySelectorAll('[data-workspace-section-shell="true"]').length === 4`,
  );
}

async function exerciseBrowser(client, origin) {
  await navigate(client, origin);
  const authored = await evaluate(
    client,
    `({
      appHeaders: document.querySelectorAll(".bench-app-header").length,
      edgeCount: document.querySelectorAll("[data-edge-id]").length,
      names: Array.from(document.querySelectorAll('[data-workspace-section-shell="true"]')).map(
        (section) => section.textContent ?? "",
      ),
      tabs: Array.from(document.querySelectorAll('.setta-workspace-saved-view-tab')).map(
        (tab) => tab.textContent?.trim(),
      ),
    })`,
  );
  assert.equal(authored.appHeaders, 0);
  assert.ok(authored.edgeCount >= 4);
  assert.deepEqual(authored.tabs, ["Build", "Runs", "Compare"]);
  for (const name of [
    "Colorful catalog images",
    "Contain",
    "Cover",
    "Thumbnail quality",
  ]) {
    assert.ok(authored.names.some((text) => text.includes(name)));
  }

  await clickButton(client, "Run all candidates");
  const completed = await waitForSnapshot(
    origin,
    "the CPU candidate comparison",
    (snapshot) =>
      snapshot.runs.length === 2 &&
      snapshot.runs.every((run) => run.status === "completed"),
  );
  assert.equal(completed.runs.flatMap((run) => run.caseResults).length, 20);
  assert.ok(
    completed.runs.every((run) =>
      run.caseResults.every((result) => result.artifacts.length === 1),
    ),
  );
  await waitFor(
    client,
    "the live run history",
    `document.querySelectorAll(".bench-runs-table tbody tr").length === 2 &&
      Array.from(document.querySelectorAll(".bench-status")).filter(
        (status) => status.textContent?.trim() === "completed",
      ).length >= 2`,
  );

  await clickSavedView(client, "Compare");
  await waitFor(
    client,
    "two Workspace-managed result windows",
    `document.querySelectorAll('.setta-workspace-window-surface .bench-comparison-window').length === 2 &&
      document.querySelectorAll('.setta-workspace-window-surface .bench-artifact-preview img').length === 2`,
  );
  const comparisonBounds = await evaluate(
    client,
    `Array.from(document.querySelectorAll('.setta-workspace-window-surface .bench-comparison-window'))
      .map((content) => content.closest('[data-workspace-window-id]')?.getBoundingClientRect())
      .filter(Boolean)
      .map((bounds) => ({ left: bounds.left, right: bounds.right }))
      .sort((left, right) => left.left - right.left)`,
  );
  assert.equal(comparisonBounds.length, 2);
  assert.ok(comparisonBounds[0].right <= comparisonBounds[1].left);
  await waitFor(
    client,
    "the aligned result artifacts",
    `Array.from(document.querySelectorAll('.bench-artifact-preview img')).every(
      (image) => image instanceof HTMLImageElement && image.complete && image.naturalWidth === 512,
    )`,
  );

  const reviewEdited = await evaluate(
    client,
    `(() => {
      const preferred = Array.from(document.querySelectorAll(".bench-preference-options label")).find(
        (label) => label.textContent?.includes("Cover"),
      )?.querySelector('input[type="radio"]');
      const note = document.querySelector(".bench-review-pane textarea");
      if (!(preferred instanceof HTMLInputElement) || !(note instanceof HTMLTextAreaElement)) {
        return false;
      }
      preferred.click();
      const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
      setter?.call(note, "Cover keeps the product edge-to-edge for the storefront grid.");
      note.dispatchEvent(new Event("input", { bubbles: true }));
      return true;
    })()`,
  );
  assert.equal(reviewEdited, true, "The review controls were unavailable.");
  await clickButton(client, "Save review");
  const reviewed = await waitForSnapshot(
    origin,
    "the durable comparison review",
    (snapshot) =>
      snapshot.reviews.some(
        (review) =>
          review.note ===
          "Cover keeps the product edge-to-edge for the storefront grid.",
      ),
  );
  const savedReview = reviewed.reviews.find((review) =>
    review.note.includes("Cover keeps"),
  );
  const coverRun = reviewed.runs.find((run) => run.candidateName === "Cover");
  assert.ok(savedReview);
  assert.ok(coverRun);
  assert.equal(savedReview.preferredRunId, coverRun.id);

  await navigate(client, origin);
  await clickSavedView(client, "Compare");
  await waitFor(
    client,
    "the persisted review after reload",
    `document.querySelector(".bench-review-pane textarea")?.value ===
        "Cover keeps the product edge-to-edge for the storefront grid." &&
      Array.from(document.querySelectorAll(".bench-preference-options label")).some(
        (label) => label.textContent?.includes("Cover") &&
          label.querySelector('input[type="radio"]')?.checked === true,
      )`,
  );
}

const temporaryDirectory = mkdtempSync(
  path.join(os.tmpdir(), "setta-bench-browser-"),
);
const projectRoot = path.join(temporaryDirectory, "project");
const executableDirectory = path.join(temporaryDirectory, "bin");
const benchBinary = path.join(
  executableDirectory,
  process.platform === "win32" ? "bench.exe" : "bench",
);
const candidateBinary = path.join(
  executableDirectory,
  process.platform === "win32"
    ? "thumbnail-candidate.exe"
    : "thumbnail-candidate",
);
let server = null;
let browser = null;
let client = null;

try {
  mkdirSync(executableDirectory, { recursive: true });
  cpSync(path.join(exampleRoot, "fixture"), projectRoot, { recursive: true });
  const stateRoot = path.join(projectRoot, ".local", "bench");
  mkdirSync(stateRoot, { recursive: true });
  cpSync(
    path.join(projectRoot, "project.json"),
    path.join(stateRoot, "project.json"),
  );
  const go = resolvePinnedGo();
  buildSurface(go, benchBinary, candidateBinary);
  server = startServer(benchBinary, projectRoot, executableDirectory);
  const origin = await waitForServer(server);
  const explicitChrome =
    process.env.BENCH_CHROME_BINARY ??
    process.env.PYTHON_CANVAS_CHROME_BINARY ??
    null;
  browser = startHeadlessChrome(explicitChrome);
  const port = await waitForHeadlessChrome(browser);
  ({ client } = await createCdpPage(port));
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
  const issues = collectBrowserIssues(client);
  try {
    await exerciseBrowser(client, origin);
  } catch (error) {
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} Browser issues: ${JSON.stringify(issues)}`,
      { cause: error },
    );
  }
  assert.deepEqual(issues, [], "Bench reported browser errors.");
} finally {
  client?.close();
  try {
    if (browser !== null) await stopHeadlessChrome(browser);
  } finally {
    try {
      await stopServer(server);
    } finally {
      rmSync(temporaryDirectory, { force: true, recursive: true });
    }
  }
}
