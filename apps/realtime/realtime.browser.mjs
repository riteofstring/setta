import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { once } from "node:events";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { fileURLToPath } from "node:url";

import { createCdpPage } from "../../scripts/lib/cdp-client.mjs";
import {
  startHeadlessChrome,
  stopHeadlessChrome,
  waitForHeadlessChrome,
} from "../../scripts/lib/headless-chrome.mjs";

const appRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(appRoot, "../..");
const backendRoot = path.join(appRoot, "backend");
const timeoutMilliseconds = 30_000;

function runCommand(command, arguments_, cwd) {
  const result = spawnSync(command, arguments_, {
    cwd,
    encoding: "utf8",
    env: process.env,
    stdio: "inherit",
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${arguments_.join(" ")} exited with ${String(result.status)}.`,
    );
  }
}

function resolveLauncherPython() {
  const configured = process.env.SETTA_LAUNCHER_PYTHON;
  if (configured !== undefined && path.isAbsolute(configured)) {
    return configured;
  }
  for (const candidate of ["python3", "python"]) {
    const result = spawnSync(
      candidate,
      ["-c", "import sys; print(sys.executable)"],
      {
        encoding: "utf8",
      },
    );
    const resolved = result.stdout?.trim();
    if (
      result.status === 0 &&
      resolved !== undefined &&
      path.isAbsolute(resolved)
    ) {
      return resolved;
    }
  }
  throw new Error("Realtime browser acceptance requires a Python interpreter.");
}

function buildSurface(binaryPath) {
  if (!process.argv.includes("--skip-build")) {
    runCommand(
      process.platform === "win32" ? "pnpm.cmd" : "pnpm",
      ["--filter", "@setta/workspace", "run", "build"],
      repositoryRoot,
    );
    runCommand(
      resolvePinnedGo(),
      ["run", "./cmd/generate-contract"],
      backendRoot,
    );
    runCommand(
      process.execPath,
      [path.join(appRoot, "scripts", "compile-validators.mjs")],
      appRoot,
    );
    runCommand(
      process.platform === "win32" ? "pnpm.cmd" : "pnpm",
      [
        "--filter",
        "@setta/realtime",
        "exec",
        "tsc",
        "--noEmit",
        "-p",
        "tsconfig.json",
      ],
      repositoryRoot,
    );
    runCommand(
      process.platform === "win32" ? "pnpm.cmd" : "pnpm",
      ["--filter", "@setta/realtime", "exec", "vite", "build"],
      repositoryRoot,
    );
  }
  runCommand(
    resolvePinnedGo(),
    ["build", "-o", binaryPath, "./cmd/realtime"],
    backendRoot,
  );
}

function lockedCodePolishyRelease() {
  const lock = JSON.parse(
    readFileSync(path.join(repositoryRoot, ".code-polishy.lock.json"), "utf8"),
  );
  if (
    typeof lock.codePolishyVersion !== "string" ||
    typeof lock.releaseDigest !== "string"
  ) {
    throw new Error("Realtime browser acceptance found an invalid tool lock.");
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
    throw new Error(
      "Realtime browser acceptance cannot resolve the pinned Go toolchain.",
    );
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
    if (existsSync(candidate)) {
      return candidate;
    }
  }
  throw new Error(
    "Realtime browser acceptance could not find the pinned Go toolchain.",
  );
}

function startServer(binaryPath, projectRoot, launcherPython) {
  const nonce = `browser-${process.pid.toString(36)}`;
  const child = spawn(
    binaryPath,
    [
      "serve",
      "--project-root",
      projectRoot,
      "--create=true",
      "--launcher-python",
      launcherPython,
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
      env: process.env,
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

function transientFetchError(error) {
  return (
    error instanceof TypeError ||
    (error instanceof Error && error.name === "TimeoutError")
  );
}

async function waitForServer(server) {
  const deadline = Date.now() + timeoutMilliseconds;
  let readiness = null;
  while (Date.now() < deadline) {
    if (server.child.exitCode !== null) {
      throw new Error(
        `Realtime host exited with ${String(server.child.exitCode)}.\n${server.output.stderr || server.output.stdout}`,
      );
    }
    const lineEnd = server.output.stdout.indexOf("\n");
    if (readiness === null && lineEnd >= 0) {
      readiness = JSON.parse(server.output.stdout.slice(0, lineEnd));
      assert.equal(readiness.app, "realtime");
      assert.equal(readiness.nonce, server.nonce);
      assert.equal(readiness.project, server.projectRoot);
      assert.match(readiness.url, /^http:\/\/127\.0\.0\.1:[0-9]+$/u);
    }
    if (readiness !== null) {
      try {
        const response = await fetch(
          `${readiness.url}/api/v2/runtime/session`,
          { signal: AbortSignal.timeout(1_000) },
        );
        assert.equal(response.status, 200);
        const identity = await response.json();
        assert.deepEqual(identity, {
          appId: "realtime",
          instanceNonce: server.nonce,
          projectPath: server.projectRoot,
          schemaVersion: "realtime-session/v1",
        });
        return readiness.url;
      } catch (error) {
        if (!transientFetchError(error)) {
          throw error;
        }
      }
    }
    await delay(50);
  }
  throw new Error("Realtime host did not publish readiness within 30 seconds.");
}

async function waitForProcessExit(child, action, timeout) {
  if (child.exitCode !== null) {
    return true;
  }
  const exit = once(child, "exit");
  action();
  if (child.exitCode !== null) {
    return true;
  }
  return Promise.race([
    exit.then(() => true),
    delay(timeout).then(() => false),
  ]);
}

function signalServerTree(server, signal) {
  const processId = server.child.pid;
  if (processId === undefined) {
    return;
  }
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
  if (server === null || server.child.exitCode !== null) {
    return;
  }
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
      `Realtime host process ${String(server.child.pid)} did not stop.`,
    );
  }
}

function section(id, kind, name, data, dimensions) {
  const [width, height] = dimensions;
  return {
    children: [],
    data,
    height,
    id,
    isHorizontalOrientation: false,
    kind,
    name,
    overflowMode: false,
    positionAndSizeLocked: false,
    styleColor: null,
    tagColor: null,
    width,
  };
}

function layout(x, y, width, height, zIndex = 1) {
  return { height, width, x, y, zIndex };
}

function binding(id, sectionId, handler, outputs, arguments_ = {}) {
  return {
    arguments: arguments_,
    handler,
    id,
    outputs,
    scheduling: {
      concurrencyGroup: id,
      concurrencyLimit: 1,
      debounceMilliseconds: 0,
      mode: "latest",
    },
    trigger: {
      event: sectionId === "drawing" ? "snapshot" : "press",
      sectionId,
    },
  };
}

function projectOperations() {
  const definitions = [
    [
      section(
        "counter",
        "button",
        "Counter",
        { label: "Increment" },
        [160, 96],
      ),
      layout(24, 24, 160, 96),
    ],
    [
      section(
        "counter-result",
        "output",
        "Counter result",
        { value: null },
        [240, 96],
      ),
      layout(208, 24, 240, 96),
    ],
    [
      section("failure", "button", "Failure", { label: "Fail" }, [160, 96]),
      layout(472, 24, 160, 96),
    ],
    [
      section(
        "failure-status",
        "status",
        "Failure status",
        { level: "idle", message: "Ready" },
        [260, 96],
      ),
      layout(656, 24, 260, 96),
    ],
    [
      section(
        "slow",
        "button",
        "Cancellation",
        { label: "Start slow" },
        [160, 96],
      ),
      layout(940, 24, 160, 96),
    ],
    [
      section(
        "slow-status",
        "status",
        "Cancellation status",
        { level: "idle", message: "Ready" },
        [260, 96],
      ),
      layout(1124, 24, 260, 96),
    ],
    [
      section(
        "drawing",
        "drawing",
        "Drawing",
        {
          background: "#ffffff",
          height: 280,
          scene: { objects: [], version: "7.4.0" },
          width: 440,
        },
        [480, 360],
      ),
      layout(24, 152, 480, 360),
    ],
    [
      section(
        "drawing-result",
        "output",
        "Drawing result",
        { value: null },
        [360, 240],
      ),
      layout(528, 152, 360, 240),
    ],
    [
      section(
        "drawing-status",
        "status",
        "Drawing status",
        { level: "idle", message: "Ready" },
        [360, 96],
      ),
      layout(528, 416, 360, 96),
    ],
  ];
  return [
    { name: "Realtime Browser Acceptance", op: "setName" },
    ...definitions.map(([definition, authoredLayout]) => ({
      layout: authoredLayout,
      op: "upsertSection",
      section: definition,
    })),
    {
      binding: binding("counter-binding", "counter", "increment", {
        result: { field: "value", sectionId: "counter-result" },
      }),
      op: "setBinding",
    },
    {
      binding: binding("failure-binding", "failure", "fail", {
        message: { field: "message", sectionId: "failure-status" },
      }),
      op: "setBinding",
    },
    {
      binding: binding("slow-binding", "slow", "slow", {
        message: { field: "message", sectionId: "slow-status" },
      }),
      op: "setBinding",
    },
    {
      binding: binding(
        "drawing-binding",
        "drawing",
        "inspect_drawing",
        {
          message: { field: "message", sectionId: "drawing-status" },
          progress: { field: "progress", sectionId: "drawing-status" },
          result: { field: "value", sectionId: "drawing-result" },
        },
        { drawing: "$event.contentRef" },
      ),
      op: "setBinding",
    },
  ];
}

async function jsonRequest(origin, pathname, init = {}) {
  const response = await fetch(`${origin}${pathname}`, {
    ...init,
    headers: {
      Accept: "application/json",
      Origin: origin,
      ...init.headers,
    },
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

async function authorProject(origin) {
  const project = await jsonRequest(origin, "/api/v1/project");
  const updated = await jsonRequest(origin, "/api/v1/project/apply", {
    body: JSON.stringify({
      expectedRevision: project.revision,
      operations: projectOperations(),
      projectId: project.id,
    }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });
  assert.equal(updated.revision, project.revision + 1);
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
    if ((await evaluate(client, expression)) === true) {
      return;
    }
    await delay(75);
  }
  throw new Error(`${description} did not occur within 30 seconds.`);
}

async function clickButton(client, label) {
  const clicked = await evaluate(
    client,
    `(() => {
      const button = Array.from(document.querySelectorAll("button")).find(
        (candidate) =>
          candidate.getAttribute("aria-label") === ${JSON.stringify(label)} ||
          candidate.textContent?.trim() === ${JSON.stringify(label)},
      );
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return false;
      }
      button.click();
      return true;
    })()`,
  );
  assert.equal(clicked, true, `${label} was not an enabled browser action.`);
}

async function clickSectionButton(client, sectionId, label) {
  const clicked = await evaluate(
    client,
    `(() => {
      const section = document.querySelector(
        ${JSON.stringify(`[data-workspace-section-shell="true"][data-section-id="${sectionId}"]`)},
      );
      const button = Array.from(section?.querySelectorAll("button") ?? []).find(
        (candidate) => candidate.getAttribute("aria-label") === ${JSON.stringify(label)},
      );
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return false;
      }
      button.click();
      return true;
    })()`,
  );
  assert.equal(
    clicked,
    true,
    `${label} was not enabled for Realtime section ${sectionId}.`,
  );
}

async function waitForProject(origin, description, predicate) {
  const deadline = Date.now() + timeoutMilliseconds;
  while (Date.now() < deadline) {
    const project = await jsonRequest(origin, "/api/v1/project");
    if (predicate(project)) {
      return project;
    }
    await delay(75);
  }
  throw new Error(`${description} did not reach the Realtime project.`);
}

async function activateSection(client, sectionId) {
  const activated = await evaluate(
    client,
    `(() => {
      const section = document.querySelector(
        ${JSON.stringify(`[data-workspace-section-shell="true"][data-section-id="${sectionId}"]`)},
      );
      if (!(section instanceof HTMLElement)) {
        return false;
      }
      section.click();
      return true;
    })()`,
  );
  assert.equal(activated, true, `Realtime section ${sectionId} was absent.`);
  await waitFor(
    client,
    `Realtime section ${sectionId} selection`,
    `document.querySelector(${JSON.stringify(`[data-workspace-section-shell="true"][data-section-id="${sectionId}"]`)})?.getAttribute("data-section-active") === "true"`,
  );
}

async function renameSection(client, sectionId, name) {
  const beganEditing = await evaluate(
    client,
    `(() => {
      const title = document.querySelector(
        ${JSON.stringify(`[data-workspace-section-shell="true"][data-section-id="${sectionId}"] [data-setta-workspace-section-title-display="true"]`)},
      );
      if (!(title instanceof HTMLElement)) {
        return false;
      }
      title.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 2 }));
      return true;
    })()`,
  );
  assert.equal(
    beganEditing,
    true,
    `Realtime section ${sectionId} had no title.`,
  );
  const inputSelector = `[data-workspace-section-shell="true"][data-section-id="${sectionId}"] input[aria-label="Section title"]`;
  await waitFor(
    client,
    `Realtime section ${sectionId} title editor`,
    `document.activeElement === document.querySelector(${JSON.stringify(inputSelector)})`,
  );
  const selected = await evaluate(
    client,
    `(() => {
      const input = document.querySelector(${JSON.stringify(inputSelector)});
      if (!(input instanceof HTMLInputElement)) {
        return false;
      }
      input.select();
      return true;
    })()`,
  );
  assert.equal(
    selected,
    true,
    `Realtime section ${sectionId} was not editable.`,
  );
  await client.send("Input.insertText", { text: name });
  await client.send("Input.dispatchKeyEvent", {
    code: "Enter",
    key: "Enter",
    type: "keyDown",
    windowsVirtualKeyCode: 13,
  });
  await client.send("Input.dispatchKeyEvent", {
    code: "Enter",
    key: "Enter",
    type: "keyUp",
    windowsVirtualKeyCode: 13,
  });
  await waitFor(
    client,
    `Realtime section ${sectionId} renamed title`,
    `document.querySelector(${JSON.stringify(`[data-workspace-section-shell="true"][data-section-id="${sectionId}"] [aria-label=${JSON.stringify(`${name}, edit section title`)}]`)}) instanceof HTMLElement`,
  );
}

async function dragSection(client, sectionId, delta) {
  const start = await evaluate(
    client,
    `(() => {
      const title = document.querySelector(
        ${JSON.stringify(`[data-workspace-section-shell="true"][data-section-id="${sectionId}"] [data-setta-workspace-section-title-display="true"]`)},
      );
      if (!(title instanceof HTMLElement) || title.closest(".nodrag") !== null) {
        return null;
      }
      const rect = title.getBoundingClientRect();
      return { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
    })()`,
  );
  assert.ok(start !== null, `Realtime section ${sectionId} was not draggable.`);
  await client.send("Input.dispatchMouseEvent", {
    buttons: 0,
    type: "mouseMoved",
    x: start.x,
    y: start.y,
  });
  await client.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
    x: start.x,
    y: start.y,
  });
  for (let step = 1; step <= 8; step += 1) {
    await client.send("Input.dispatchMouseEvent", {
      button: "left",
      buttons: 1,
      type: "mouseMoved",
      x: start.x + (delta.x * step) / 8,
      y: start.y + (delta.y * step) / 8,
    });
    await delay(20);
  }
  await client.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x: start.x + delta.x,
    y: start.y + delta.y,
  });
}

async function resizeSection(client, sectionId, delta) {
  const start = await evaluate(
    client,
    `(() => {
      const handle = document.querySelector(
        ${JSON.stringify(`.react-flow__node[data-id="${sectionId}"] .section-resize-handle-right`)},
      );
      if (!(handle instanceof HTMLElement)) {
        return null;
      }
      const rect = handle.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return null;
      }
      const point = { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 };
      return document.elementFromPoint(point.x, point.y)?.closest(".section-resize-handle-right") === handle
        ? point
        : null;
    })()`,
  );
  assert.ok(start !== null, `Realtime section ${sectionId} was not resizable.`);
  await client.send("Input.dispatchMouseEvent", {
    buttons: 0,
    type: "mouseMoved",
    x: start.x,
    y: start.y,
  });
  await client.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
    x: start.x,
    y: start.y,
  });
  for (let step = 1; step <= 8; step += 1) {
    await client.send("Input.dispatchMouseEvent", {
      button: "left",
      buttons: 1,
      type: "mouseMoved",
      x: start.x + (delta.x * step) / 8,
      y: start.y + (delta.y * step) / 8,
    });
    await delay(20);
  }
  await client.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x: start.x + delta.x,
    y: start.y + delta.y,
  });
}

async function exerciseWorkspaceSection(client, origin) {
  await activateSection(client, "drawing");
  await clickSectionButton(client, "drawing", "Lock position and size");
  await waitForProject(
    origin,
    "the drawing section lock",
    (project) => project.sections.drawing?.positionAndSizeLocked === true,
  );
  await waitFor(
    client,
    "the drawing section selection after its persisted lock",
    `document.querySelector('[data-workspace-section-shell="true"][data-section-id="drawing"]')?.getAttribute("data-section-active") === "true"`,
  );
  await clickSectionButton(client, "drawing", "Unlock position and size");
  await waitForProject(
    origin,
    "the drawing section unlock",
    (project) => project.sections.drawing?.positionAndSizeLocked === false,
  );

  await clickSectionButton(client, "drawing", "Minimize section");
  await waitFor(
    client,
    "the minimized drawing section",
    `document.querySelector('[data-workspace-section-shell="true"][data-section-id="drawing"] button[aria-label="Expand section"]') instanceof HTMLButtonElement &&
      document.querySelector(".realtime-drawing-stage") === null`,
  );
  await clickSectionButton(client, "drawing", "Expand section");
  await waitFor(
    client,
    "the expanded drawing section",
    `document.querySelector(".realtime-drawing-stage .upper-canvas") instanceof HTMLCanvasElement`,
  );

  await renameSection(client, "drawing", "Drawing workspace section");
  await waitForProject(
    origin,
    "the drawing section rename",
    (project) => project.sections.drawing?.name === "Drawing workspace section",
  );

  const beforeMove = await jsonRequest(origin, "/api/v1/project");
  await dragSection(client, "drawing", { x: 72, y: 48 });
  await waitForProject(origin, "the drawing section movement", (project) => {
    const before = beforeMove.layout.topLevelSections.drawing;
    const after = project.layout.topLevelSections.drawing;
    return after?.x !== before?.x || after?.y !== before?.y;
  });

  const beforeResize = await jsonRequest(origin, "/api/v1/project");
  const beforeCanvasWidth = await evaluate(
    client,
    `document.querySelector(".realtime-drawing-stage .lower-canvas")?.getBoundingClientRect().width ?? null`,
  );
  assert.ok(
    typeof beforeCanvasWidth === "number" && beforeCanvasWidth > 0,
    "The drawing canvas was not measurable before its section resize.",
  );
  await resizeSection(client, "drawing", { x: -96, y: 0 });
  await waitForProject(origin, "the drawing section resize", (project) => {
    const before = beforeResize.sections.drawing;
    const after = project.sections.drawing;
    return after?.width !== before?.width;
  });
  await waitFor(
    client,
    "the responsive drawing canvas",
    `(() => {
      const stage = document.querySelector(".realtime-drawing-stage");
      const canvas = stage?.querySelector(".lower-canvas");
      if (!(stage instanceof HTMLElement) || !(canvas instanceof HTMLCanvasElement)) {
        return false;
      }
      const stageRect = stage.getBoundingClientRect();
      const canvasRect = canvas.getBoundingClientRect();
      const expectedRatio = 440 / 280;
      return stageRect.height > 0 &&
        canvas.width === 440 && canvas.height === 280 &&
        canvasRect.width <= stageRect.width + 1 &&
        canvasRect.height <= stageRect.height + 1 &&
        canvasRect.width < ${String(beforeCanvasWidth)} - 5 &&
        Math.abs(canvasRect.width / canvasRect.height - expectedRatio) < 0.02;
    })()`,
  );
}

function outputExpression(name, predicate) {
  return `(() => {
    const section = Array.from(document.querySelectorAll('[data-workspace-section-shell="true"]')).find(
      (candidate) => candidate.getAttribute("aria-label")?.startsWith(${JSON.stringify(`${name} section`)}),
    );
    const value = section?.querySelector(".realtime-output-value")?.textContent?.trim();
    return typeof value === "string" && (${predicate});
  })()`;
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

async function waitForDrawingResult(client, origin) {
  try {
    await waitFor(
      client,
      "the drawing snapshot Python result",
      outputExpression(
        "Drawing result",
        `value.includes('"mediaType": "image/png"') &&
          value.includes('"exists": true') &&
          /"bytes": [1-9][0-9]*/u.test(value)`,
      ),
    );
  } catch (error) {
    const runtime = await jsonRequest(origin, "/api/v1/runtime/snapshot");
    const text = await evaluate(client, "document.body.textContent");
    throw new Error(
      `${error instanceof Error ? error.message : String(error)}\nRuntime: ${JSON.stringify(runtime)}\nPage: ${String(text)}`,
      { cause: error },
    );
  }
}

async function visibleDrawingResult(client) {
  return evaluate(
    client,
    `(() => {
      const section = Array.from(document.querySelectorAll('[data-workspace-section-shell="true"]')).find(
        (candidate) => candidate.getAttribute("aria-label")?.startsWith("Drawing result section"),
      );
      const text = section?.querySelector(".realtime-output-value")?.textContent?.trim();
      if (typeof text !== "string" || text === "") {
        return null;
      }
      try {
        return JSON.parse(text);
      } catch {
        return null;
      }
    })()`,
  );
}

async function observeDrawingResult(client, observedResults) {
  const result = await visibleDrawingResult(client);
  if (
    result === null ||
    typeof result !== "object" ||
    !Number.isInteger(result.sequence) ||
    observedResults.at(-1)?.sequence === result.sequence
  ) {
    return false;
  }
  assert.equal(result.mediaType, "image/png");
  assert.equal(result.exists, true);
  assert.ok(result.bytes > 0);
  assert.match(result.sha256, /^[a-f0-9]{64}$/u);
  const previous = observedResults.at(-1);
  if (previous !== undefined) {
    assert.ok(result.sequence > previous.sequence);
    assert.notEqual(result.sha256, previous.sha256);
  }
  observedResults.push(result);
  return observedResults.length >= 2;
}

async function drawStrokeBeforeRelease(client, origin) {
  const bounds = await evaluate(
    client,
    `(() => {
      const canvas = document.querySelector(".realtime-drawing-stage .upper-canvas");
      if (!(canvas instanceof HTMLCanvasElement)) {
        return null;
      }
      const rect = canvas.getBoundingClientRect();
      return { height: rect.height, width: rect.width, x: rect.x, y: rect.y };
    })()`,
  );
  assert.ok(
    bounds !== null && bounds.width > 20 && bounds.height > 20,
    `The drawing canvas was not pointer-sized: ${JSON.stringify(bounds)}.`,
  );
  const startX = bounds.x + bounds.width * 0.2;
  const startY = bounds.y + bounds.height * 0.5;
  await client.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
    x: startX,
    y: startY,
  });
  const observedResults = [];
  let finalX = startX;
  let finalY = startY;
  try {
    const deadline = Date.now() + 4_000;
    for (let index = 1; Date.now() < deadline; index += 1) {
      finalX = startX + bounds.width * 0.3 * (1 + Math.sin(index / 3));
      finalY = startY + Math.sin(index / 2) * bounds.height * 0.15;
      await client.send("Input.dispatchMouseEvent", {
        button: "left",
        buttons: 1,
        type: "mouseMoved",
        x: finalX,
        y: finalY,
      });
      await delay(60);
      if (await observeDrawingResult(client, observedResults)) {
        break;
      }
    }
    assert.ok(
      observedResults.length >= 2,
      `Only ${String(observedResults.length)} drawing result became visible during the sustained stroke.`,
    );
    await waitForDrawingResult(client, origin);
  } finally {
    await client.send("Input.dispatchMouseEvent", {
      button: "left",
      buttons: 0,
      clickCount: 1,
      type: "mouseReleased",
      x: finalX,
      y: finalY,
    });
  }
}

async function exerciseBrowser(client, origin) {
  const loaded = client.waitForEvent(
    "Page.loadEventFired",
    timeoutMilliseconds,
  );
  await client.send("Page.navigate", { url: origin });
  await loaded;
  await waitFor(
    client,
    "the connected editable Realtime workspace",
    `(() => {
      const stage = document.querySelector(".realtime-drawing-stage");
      const canvas = stage?.querySelector(".canvas-container");
      const section = document.querySelector('[data-workspace-section-shell="true"][data-section-id="drawing"]');
      return document.querySelector(".realtime-connection-connected") !== null &&
        document.querySelector(".realtime-app-chrome") === null &&
        section?.querySelector('button[aria-label="Lock position and size"]:not(:disabled)') !== null &&
        section?.querySelector('button[aria-label="Minimize section"]') !== null &&
        section?.querySelector('[data-setta-workspace-section-title-display="true"]') !== null &&
        stage instanceof HTMLElement &&
        canvas instanceof HTMLElement &&
        getComputedStyle(stage).padding === "0px" &&
        getComputedStyle(canvas).borderWidth === "0px";
    })()`,
  );
  await waitFor(
    client,
    "the available runtime reload action",
    `Array.from(document.querySelectorAll("button")).some(
      (button) => button.textContent?.trim() === "Reload runtime" && !button.disabled,
    )`,
  );

  await exerciseWorkspaceSection(client, origin);

  await clickButton(client, "Reload runtime");
  await waitFor(
    client,
    "the ready Python worker",
    `document.querySelector('[data-worker-state="ready"]') !== null`,
  );

  await clickButton(client, "Increment");
  await waitFor(
    client,
    "the first ordinary return",
    outputExpression("Counter result", 'value === "1"'),
  );
  await clickButton(client, "Increment");
  await waitFor(
    client,
    "the second ordinary return",
    outputExpression("Counter result", 'value === "2"'),
  );

  await drawStrokeBeforeRelease(client, origin);
  await delay(300);
  await clickButton(client, "Add rectangle");
  await delay(300);
  const project = await jsonRequest(origin, "/api/v1/project");
  assert.ok(project.revision >= 2);
  assert.ok(project.sections.drawing.data.scene.objects.length >= 2);

  await clickButton(client, "Fail");
  await waitFor(
    client,
    "the visible handler failure",
    `document.body.textContent?.includes("intentional browser failure") === true`,
  );

  await clickButton(client, "Start slow");
  await waitFor(
    client,
    "the cooperative cancellation action",
    `Array.from(document.querySelectorAll("button")).some(
      (button) => button.textContent?.trim() === "Cancel" && !button.disabled,
    )`,
  );
  await clickButton(client, "Cancel");
  await waitFor(
    client,
    "the visible cancelled outcome",
    `document.body.textContent?.includes("Invocation was cancelled") === true`,
  );

  await clickButton(client, "Reload runtime");
  await waitFor(
    client,
    "the restarted Python worker",
    `document.querySelector('[data-worker-state="ready"]') !== null &&
      !document.body.textContent?.includes("intentional browser failure")`,
  );
  await clickButton(client, "Increment");
  await waitFor(
    client,
    "the reset process resource",
    outputExpression("Counter result", 'value === "1"'),
  );
  await waitFor(
    client,
    "the visible isolated worker log",
    `document.body.textContent?.includes("counter 1") === true`,
  );
}

const temporaryDirectory = mkdtempSync(
  path.join(os.tmpdir(), "setta-realtime-browser-"),
);
const projectRoot = path.join(temporaryDirectory, "project");
const binaryPath = path.join(
  temporaryDirectory,
  process.platform === "win32" ? "realtime.exe" : "realtime",
);
let server = null;
let browser = null;
let client = null;

try {
  buildSurface(binaryPath);
  mkdirSync(projectRoot, { recursive: true });
  writeFileSync(
    path.join(projectRoot, "app.py"),
    `import asyncio
import os

count = 0
drawing_sequence = 0

def increment():
    global count
    count += 1
    print(f"counter {count}")
    return {"result": count}

def fail():
    raise ValueError("intentional browser failure")

async def slow():
    for index in range(100):
        await asyncio.sleep(0.05)
        yield {
            "artifacts": [],
            "progress": index / 100,
            "message": "Working",
            "outputs": {},
        }

async def inspect_drawing(drawing):
    global drawing_sequence
    drawing_sequence += 1
    sequence = drawing_sequence
    yield {
        "artifacts": [],
        "progress": 0.5,
        "message": "Inspecting",
        "outputs": {},
    }
    await asyncio.sleep(0.5)
    yield {
        "artifacts": [],
        "progress": 1,
        "message": "Complete",
        "outputs": {
            "result": {
                "bytes": drawing["byteLength"],
                "exists": os.path.isfile(drawing["path"]),
                "mediaType": drawing["mediaType"],
                "sequence": sequence,
                "sha256": drawing["sha256"],
            },
            "message": "Complete",
            "progress": 1,
        },
    }

handlers = {
    "fail": fail,
    "increment": increment,
    "inspect_drawing": inspect_drawing,
    "slow": slow,
}
`,
  );
  server = startServer(binaryPath, projectRoot, resolveLauncherPython());
  const origin = await waitForServer(server);
  await authorProject(origin);
  const explicitChrome =
    process.env.REALTIME_CHROME_BINARY ??
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
      height: 820,
      mobile: false,
      width: 1_440,
    }),
  ]);
  const issues = collectBrowserIssues(client);
  await exerciseBrowser(client, origin);
  assert.deepEqual(issues, [], "Realtime reported browser errors.");
} finally {
  client?.close();
  try {
    if (browser !== null) {
      await stopHeadlessChrome(browser);
    }
  } finally {
    try {
      await stopServer(server);
    } finally {
      rmSync(temporaryDirectory, { force: true, recursive: true });
    }
  }
}
