import assert from "node:assert/strict";
import { spawn, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import { once } from "node:events";
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
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
const fixtureRoot = path.join(
  appRoot,
  "examples",
  "review-playground",
  "fixture",
);
const timeoutMilliseconds = 30_000;
const completionRequestId = "checkout-completion";
const matrixRequestId = "schema-rollout";
const artifactRequestId = "launch-poster";
const completionSectionId = `review:request:${completionRequestId}`;
const matrixSectionId = `review:request:${matrixRequestId}`;
const artifactChoiceSectionId = `review:request:${artifactRequestId}`;
const checkoutLogSectionId = `review:evidence:${completionRequestId}:checkout-log`;
const shadowEvidenceSectionId = `review:evidence:${matrixRequestId}:shadow-read`;
const consumerEvidenceSectionId = `review:evidence:${matrixRequestId}:consumer-compatibility`;
const eventPublisherSectionId = `review:evidence:${matrixRequestId}:event-publisher`;
const apertureEvidenceSectionId = `review:evidence:${artifactRequestId}:poster-aperture`;

function commandEnvironment(options) {
  return options.env ?? process.env;
}

function commandStdio(options) {
  return options.capture ? ["ignore", "pipe", "pipe"] : "inherit";
}

function commandFailure(result) {
  return `${result.stderr ?? ""}${result.stdout ?? ""}`;
}

function commandOutput(result) {
  return result.stdout?.trim() ?? "";
}

function runCommand(command, arguments_, cwd, options = {}) {
  const result = spawnSync(command, arguments_, {
    cwd,
    encoding: "utf8",
    env: commandEnvironment(options),
    stdio: commandStdio(options),
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${arguments_.join(" ")} exited with ${String(result.status)}.\n${commandFailure(result)}`,
    );
  }
  return commandOutput(result);
}

function runCommandBytes(command, arguments_, cwd) {
  const result = spawnSync(command, arguments_, {
    cwd,
    encoding: null,
    env: process.env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (result.error !== undefined) {
    throw result.error;
  }
  if (result.status !== 0) {
    throw new Error(
      `${command} ${arguments_.join(" ")} exited with ${String(result.status)}.\n${result.stderr?.toString("utf8") ?? ""}`,
    );
  }
  return result.stdout;
}

function sha256(data) {
  return createHash("sha256").update(data).digest("hex");
}

function diffHunkRange(line) {
  const match = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/u.exec(line);
  if (match === null) {
    return null;
  }
  return {
    newLines: match[4] === undefined ? 1 : Number(match[4]),
    newStart: Number(match[3]),
    oldLines: match[2] === undefined ? 1 : Number(match[2]),
    oldStart: Number(match[1]),
  };
}

function sameHunk(first, second) {
  return (
    first.newLines === second.newLines &&
    first.newStart === second.newStart &&
    first.oldLines === second.oldLines &&
    first.oldStart === second.oldStart
  );
}

function selectDiffHunk(patch, wanted) {
  const lines = patch.toString("utf8").replace(/\n$/u, "").split("\n");
  let preambleEnd = null;
  let selectedStart = null;
  let selectedEnd = lines.length;
  for (const [index, line] of lines.entries()) {
    const observed = diffHunkRange(line);
    if (observed === null) {
      continue;
    }
    preambleEnd ??= index;
    if (selectedStart !== null) {
      selectedEnd = index;
      break;
    }
    if (sameHunk(observed, wanted)) {
      selectedStart = index;
    }
  }
  assert.notEqual(preambleEnd, null);
  assert.notEqual(selectedStart, null);
  return Buffer.from(
    [
      ...lines.slice(0, preambleEnd),
      ...lines.slice(selectedStart, selectedEnd),
    ].join("\n") + "\n",
    "utf8",
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
    throw new Error("Review browser acceptance found an invalid tool lock.");
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
      "Review browser acceptance cannot resolve the pinned Go toolchain.",
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
    "Review browser acceptance could not find the pinned Go toolchain.",
  );
}

function buildSurface(binaryPath) {
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const go = resolvePinnedGo();
  if (!process.argv.includes("--skip-build")) {
    runCommand(
      pnpm,
      ["--filter", "@riteofstring/setta", "run", "build"],
      repositoryRoot,
    );
    runCommand(
      go,
      ["run", "-mod=readonly", "./cmd/generate-contract", "-check"],
      backendRoot,
    );
    runCommand(
      process.execPath,
      [path.join(appRoot, "scripts", "compile-validators.mjs"), "--check"],
      appRoot,
    );
    runCommand(
      pnpm,
      [
        "--filter",
        "@setta/review",
        "exec",
        "tsc",
        "--noEmit",
        "-p",
        "tsconfig.json",
      ],
      repositoryRoot,
    );
    runCommand(
      pnpm,
      ["--filter", "@setta/review", "exec", "vite", "build"],
      repositoryRoot,
    );
  }
  runCommand(
    go,
    ["build", "-mod=readonly", "-o", binaryPath, "./cmd/review"],
    backendRoot,
  );
}

function updateEvidenceIdentities(projectRoot, revision) {
  const manifest = JSON.parse(
    readFileSync(path.join(projectRoot, "review.json"), "utf8"),
  );
  for (const requestPath of manifest.requests) {
    const absolute = path.join(projectRoot, requestPath);
    const request = JSON.parse(readFileSync(absolute, "utf8"));
    for (const evidence of request.evidence) {
      if (evidence.kind === "gitDiff") {
        const reference = evidence.gitDiff;
        reference.baseRevision = revision;
        const arguments_ = [
          "diff",
          "--no-ext-diff",
          "--no-color",
          `--unified=${String(reference.contextLines)}`,
          revision,
        ];
        if (typeof reference.targetRevision === "string") {
          arguments_.push(reference.targetRevision);
        }
        arguments_.push("--", reference.path);
        const patch = selectDiffHunk(
          runCommandBytes(
            "git",
            arguments_,
            path.join(projectRoot, reference.repositoryPath),
          ),
          reference.hunk,
        );
        reference.patchSha256 = sha256(patch);
      } else if (
        evidence.kind === "code" ||
        evidence.kind === "text" ||
        evidence.kind === "json"
      ) {
        const reference = evidence[evidence.kind];
        reference.sourceSha256 = sha256(
          readFileSync(path.join(projectRoot, reference.path)),
        );
      }
    }
    writeFileSync(absolute, `${JSON.stringify(request, null, 2)}\n`, "utf8");
  }
}

function seedProject(projectRoot, binaryPath) {
  cpSync(fixtureRoot, projectRoot, { recursive: true });
  const repository = path.join(projectRoot, "repository");
  mkdirSync(repository);
  const baseDirectory = path.join(projectRoot, "repository-base");
  const currentDirectory = path.join(projectRoot, "repository-current");
  const repositoryFiles = [
    "event_bus.ts",
    "event_v3.ts",
    "retry_policy.go",
    "support.go",
  ];
  for (const name of repositoryFiles) {
    copyFileSync(path.join(baseDirectory, name), path.join(repository, name));
  }
  runCommand("git", ["init", "--quiet", "--object-format=sha1"], repository);
  runCommand("git", ["add", "--", ...repositoryFiles], repository);
  runCommand(
    "git",
    [
      "-c",
      "user.name=Setta Review",
      "-c",
      "user.email=review@setta.local",
      "-c",
      "commit.gpgSign=false",
      "commit",
      "--quiet",
      "-m",
      "fixture base",
    ],
    repository,
  );
  const revision = runCommand("git", ["rev-parse", "HEAD"], repository, {
    capture: true,
  });
  assert.match(revision, /^[0-9a-f]{40}$/u);
  for (const name of repositoryFiles) {
    copyFileSync(
      path.join(currentDirectory, name),
      path.join(repository, name),
    );
  }
  writeFileSync(
    path.join(projectRoot, "evidence", "checkout-run.log"),
    [
      "attempt=1 order=checkout-42 key=checkout:checkout-42",
      "attempt=1 result=timeout",
      "attempt=2 order=checkout-42 key=checkout:checkout-42",
      "attempt=2 result=timeout",
      "attempt=3 order=checkout-42 key=checkout:checkout-42",
      "attempt=3 result=charged",
      "duplicate_charges=0",
      "idempotency_key_reuse_rate=1.0",
      "p95_latency_ms=612",
      "p99_latency_ms=704",
      "fresh_database=passed",
      "run=complete",
    ].join("\n") + "\n",
    "utf8",
  );
  updateEvidenceIdentities(projectRoot, revision);
  const applied = JSON.parse(
    runCommand(
      binaryPath,
      [
        "apply",
        "--project-root",
        projectRoot,
        "--file",
        path.join(projectRoot, "seed-assessments.json"),
      ],
      projectRoot,
      { capture: true },
    ),
  );
  assert.equal(applied.version, 1);
  assert.equal(applied.snapshot.revision, 1);
  assert.equal(applied.snapshot.requests[0].assessments.length, 6);
  return revision;
}

function startServer(binaryPath, projectRoot) {
  const nonce = `browser-${process.pid.toString(36)}`;
  const child = spawn(
    binaryPath,
    [
      "serve",
      "--project-root",
      projectRoot,
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
        `Review host exited with ${String(server.child.exitCode)}.\n${server.output.stderr || server.output.stdout}`,
      );
    }
    const lineEnd = server.output.stdout.indexOf("\n");
    if (readiness === null && lineEnd >= 0) {
      readiness = JSON.parse(server.output.stdout.slice(0, lineEnd));
      assert.equal(readiness.app, "review");
      assert.equal(readiness.nonce, server.nonce);
      assert.equal(readiness.project, realpathSync(server.projectRoot));
      assert.match(readiness.url, /^http:\/\/127\.0\.0\.1:[0-9]+$/u);
    }
    if (readiness !== null) {
      try {
        const response = await fetch(
          `${readiness.url}/api/v2/runtime/session`,
          { signal: AbortSignal.timeout(1_000) },
        );
        assert.equal(response.status, 200);
        assert.deepEqual(await response.json(), {
          appId: "review",
          instanceNonce: server.nonce,
          projectPath: realpathSync(server.projectRoot),
          schemaVersion: "review-session/v1",
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
  throw new Error("Review host did not publish readiness within 30 seconds.");
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
      `Review host process ${String(server.child.pid)} did not stop.`,
    );
  }
}

async function jsonRequest(origin, pathname, init = {}) {
  const response = await fetch(`${origin}${pathname}`, {
    ...init,
    signal: AbortSignal.timeout(5_000),
  });
  if (!response.ok) {
    throw new Error(
      `${pathname} returned HTTP ${String(response.status)}: ${await response.text()}`,
    );
  }
  return response.json();
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
  const observed = await evaluate(
    client,
    `({
      body: document.body.textContent?.slice(0, 3_000) ?? "",
      title: document.title,
      url: location.href,
    })`,
  );
  throw new Error(
    `${description} did not occur within 30 seconds: ${JSON.stringify(observed)}`,
  );
}

async function waitForValue(description, read, accept) {
  const deadline = Date.now() + timeoutMilliseconds;
  let value;
  while (Date.now() < deadline) {
    value = await read();
    if (accept(value)) {
      return value;
    }
    await delay(75);
  }
  throw new Error(
    `${description} did not occur within 30 seconds: ${JSON.stringify(value)}`,
  );
}

function sectionSelector(sectionId) {
  return `[data-workspace-section-shell="true"][data-section-id="${sectionId}"]`;
}

async function focusSectionFromOutline(client, sectionId) {
  const focused = await evaluate(
    client,
    `(() => {
      const item = document.querySelector(${JSON.stringify(`[data-workspace-outline-item="${sectionId}"]`)});
      if (!(item instanceof HTMLElement)) {
        return false;
      }
      item.click();
      return true;
    })()`,
  );
  assert.equal(focused, true, `Review could not focus ${sectionId}.`);
  await waitFor(
    client,
    `the focused ${sectionId} section`,
    `(() => {
      const item = document.querySelector(${JSON.stringify(`[data-workspace-outline-item="${sectionId}"]`)});
      const section = document.querySelector(${JSON.stringify(sectionSelector(sectionId))});
      const bounds = section?.getBoundingClientRect();
      return item?.getAttribute("aria-selected") === "true" &&
        bounds !== undefined && bounds.width > 0 && bounds.height > 0 &&
        bounds.left < innerWidth && bounds.right > 0 &&
        bounds.top < innerHeight && bounds.bottom > 0;
    })()`,
  );
  await delay(350);
}

async function clickWorkspaceControl(client, label) {
  const clicked = await evaluate(
    client,
    `(() => {
      const button = document.querySelector(${JSON.stringify(`button[aria-label="${label}"]`)});
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return false;
      }
      button.click();
      return true;
    })()`,
  );
  assert.equal(clicked, true, `Review could not activate ${label}.`);
  await delay(350);
}

async function clickSavedViewTab(client, label) {
  const clicked = await evaluate(
    client,
    `(() => {
      const button = Array.from(document.querySelectorAll('[role="tab"]')).find(
        (candidate) => candidate.textContent?.trim() === ${JSON.stringify(label)},
      );
      if (!(button instanceof HTMLButtonElement) || button.disabled) {
        return false;
      }
      button.click();
      return true;
    })()`,
  );
  assert.equal(clicked, true, `Review could not activate the ${label} view.`);
  await waitFor(
    client,
    `the active ${label} view`,
    `Array.from(document.querySelectorAll('[role="tab"]')).some(
      (candidate) => candidate.textContent?.trim() === ${JSON.stringify(label)} &&
        candidate.getAttribute('aria-selected') === 'true',
    )`,
  );
  await delay(350);
}

async function clickSectionButton(client, sectionId, label) {
  const clicked = await evaluate(
    client,
    `(() => {
      const section = document.querySelector(${JSON.stringify(sectionSelector(sectionId))});
      const button = Array.from(section?.querySelectorAll("button") ?? []).find(
        (candidate) =>
          candidate.getAttribute("aria-label") === ${JSON.stringify(label)} ||
          candidate.textContent?.trim() === ${JSON.stringify(label)} ||
          candidate.querySelector("strong")?.textContent?.trim() === ${JSON.stringify(label)},
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
    `${label} was not enabled in Review section ${sectionId}.`,
  );
}

async function fillSectionControl(client, sectionId, selector, value) {
  const changed = await evaluate(
    client,
    `(() => {
      const section = document.querySelector(${JSON.stringify(sectionSelector(sectionId))});
      const control = section?.querySelector(${JSON.stringify(selector)});
      if (!(control instanceof HTMLInputElement) && !(control instanceof HTMLTextAreaElement)) {
        return false;
      }
      const prototype = control instanceof HTMLTextAreaElement
        ? HTMLTextAreaElement.prototype
        : HTMLInputElement.prototype;
      const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
      if (!setter) {
        return false;
      }
      control.focus();
      setter.call(control, ${JSON.stringify(value)});
      control.dispatchEvent(new Event("input", { bubbles: true }));
      control.dispatchEvent(new Event("change", { bubbles: true }));
      return control.value === ${JSON.stringify(value)};
    })()`,
  );
  assert.equal(changed, true, `Review could not edit ${selector}.`);
}

async function clickElementCenter(client, selector, description) {
  const point = await evaluate(
    client,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLElement) ||
        (element instanceof HTMLButtonElement && element.disabled)) {
        return null;
      }
      const bounds = element.getBoundingClientRect();
      if (bounds.width <= 0 || bounds.height <= 0 || bounds.bottom <= 0 ||
        bounds.right <= 0 || bounds.top >= innerHeight || bounds.left >= innerWidth) {
        return null;
      }
      return {
        x: Math.max(1, Math.min(innerWidth - 1, bounds.left + bounds.width / 2)),
        y: Math.max(1, Math.min(innerHeight - 1, bounds.top + bounds.height / 2)),
      };
    })()`,
  );
  assert.ok(point !== null, `${description} was not pointer-accessible.`);
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: point.x,
    y: point.y,
  });
  await client.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
    x: point.x,
    y: point.y,
  });
  await client.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x: point.x,
    y: point.y,
  });
}

async function scrollSectionHorizontally(client, sectionId) {
  await focusSectionFromOutline(client, sectionId);
  const surface = await evaluate(
    client,
    `(() => {
      const section = document.querySelector(${JSON.stringify(sectionSelector(sectionId))});
      const evidence = section?.querySelector(".review-evidence");
      const lines = evidence?.querySelector(".review-code-lines");
      if (!(evidence instanceof HTMLElement) || !(lines instanceof HTMLElement)) {
        return null;
      }
      if (evidence.scrollWidth <= evidence.clientWidth) {
        lines.style.minWidth = String(evidence.clientWidth + 500) + "px";
      }
      evidence.scrollLeft = 0;
      const bounds = evidence.getBoundingClientRect();
      return {
        x: Math.max(1, Math.min(innerWidth - 1, bounds.left + bounds.width / 2)),
        y: Math.max(1, Math.min(innerHeight - 1, bounds.top + bounds.height / 2)),
      };
    })()`,
  );
  assert.ok(surface !== null, `${sectionId} had no horizontal overflow.`);
  await client.send("Input.dispatchMouseEvent", {
    deltaX: 180,
    deltaY: 0,
    type: "mouseWheel",
    x: surface.x,
    y: surface.y,
  });
  await waitFor(
    client,
    `horizontal trackpad scrolling in ${sectionId}`,
    `(() => {
      const section = document.querySelector(${JSON.stringify(sectionSelector(sectionId))});
      const evidence = section?.querySelector(".review-evidence");
      return evidence instanceof HTMLElement && evidence.scrollLeft > 0;
    })()`,
  );
}

function requestSnapshot(snapshot, requestId) {
  const request = snapshot.requests.find(
    (candidate) => candidate.request.id === requestId,
  );
  assert.ok(request, `Review snapshot omitted ${requestId}.`);
  return request;
}

function isNormalizedAnnotationPoint(point) {
  return point.x >= 0 && point.x <= 1 && point.y >= 0 && point.y <= 1;
}

function hasApertureAnnotation(response) {
  const annotation = response.annotations[0];
  const points = annotation?.paths[0]?.points ?? [];
  return (
    annotation?.artifactEvidenceId === "poster-aperture" &&
    points.length >= 2 &&
    points.every(isNormalizedAnnotationPoint)
  );
}

function isArtifactRevisionResponse(response, rationale) {
  return (
    response?.type === "choice" &&
    response.choice.outcome === "changesRequested" &&
    response.rationale === rationale &&
    hasApertureAnnotation(response)
  );
}

function isArtifactRevisionSnapshot(snapshot, expectedRevision, rationale) {
  const response = requestSnapshot(snapshot, artifactRequestId).response;
  return (
    snapshot.revision === expectedRevision &&
    isArtifactRevisionResponse(response, rationale)
  );
}

async function waitForSnapshot(origin, description, accept) {
  return waitForValue(
    description,
    () => jsonRequest(origin, "/api/v1/review"),
    accept,
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

async function drawArtifactStroke(client) {
  const selector = `${sectionSelector(apertureEvidenceSectionId)} [data-workspace-normalized-stroke-surface]`;
  await waitFor(
    client,
    "the visible aperture annotation surface",
    `(() => {
      const surface = document.querySelector(${JSON.stringify(selector)});
      if (!(surface instanceof SVGSVGElement) || surface.getAttribute("aria-disabled") !== "false") {
        return false;
      }
      const bounds = surface.getBoundingClientRect();
      return bounds.width > 120 && bounds.height > 120 && bounds.left < innerWidth &&
        bounds.right > 0 && bounds.top < innerHeight && bounds.bottom > 0;
    })()`,
  );
  const bounds = await evaluate(
    client,
    `(() => {
      const bounds = document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();
      return { height: bounds.height, width: bounds.width, x: bounds.x, y: bounds.y };
    })()`,
  );
  const points = [
    [0.22, 0.35],
    [0.34, 0.28],
    [0.48, 0.42],
    [0.63, 0.31],
    [0.76, 0.46],
  ].map(([x, y]) => ({
    x: bounds.x + bounds.width * x,
    y: bounds.y + bounds.height * y,
  }));
  await client.send("Input.dispatchMouseEvent", {
    type: "mouseMoved",
    x: points[0].x,
    y: points[0].y,
  });
  await client.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
    x: points[0].x,
    y: points[0].y,
  });
  for (const point of points.slice(1)) {
    await client.send("Input.dispatchMouseEvent", {
      button: "left",
      buttons: 1,
      type: "mouseMoved",
      x: point.x,
      y: point.y,
    });
    await delay(35);
  }
  const finalPoint = points.at(-1);
  await client.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x: finalPoint.x,
    y: finalPoint.y,
  });
  await waitFor(
    client,
    "the completed artifact annotation",
    `document.querySelector(${JSON.stringify(`${selector} [data-workspace-normalized-stroke]`)}) !== null`,
  );
}

async function artifactOverlayGeometry(client, rootSelector) {
  return evaluate(
    client,
    `(() => {
      const root = document.querySelector(${JSON.stringify(rootSelector)});
      const stage = root?.querySelector(".review-artifact-stage");
      const image = stage?.querySelector("img");
      const overlay = stage?.querySelector('[data-workspace-normalized-stroke-surface]');
      if (!(stage instanceof HTMLElement) || !(image instanceof HTMLImageElement) ||
        !(overlay instanceof SVGSVGElement) || image.naturalWidth <= 0 || image.naturalHeight <= 0) {
        return null;
      }
      const imageBox = image.getBoundingClientRect();
      const overlayBox = overlay.getBoundingClientRect();
      const stageBox = stage.getBoundingClientRect();
      const scale = Math.min(
        imageBox.width / image.naturalWidth,
        imageBox.height / image.naturalHeight,
      );
      const expectedWidth = image.naturalWidth * scale;
      const expectedHeight = image.naturalHeight * scale;
      return {
        actual: {
          height: overlayBox.height,
          left: overlayBox.left,
          top: overlayBox.top,
          width: overlayBox.width,
        },
        expected: {
          height: expectedHeight,
          left: imageBox.left + (imageBox.width - expectedWidth) / 2,
          top: imageBox.top + (imageBox.height - expectedHeight) / 2,
          width: expectedWidth,
        },
        margin: Math.max(
          overlayBox.left - stageBox.left,
          overlayBox.top - stageBox.top,
          stageBox.right - overlayBox.right,
          stageBox.bottom - overlayBox.bottom,
        ),
      };
    })()`,
  );
}

function assertArtifactOverlayGeometry(geometry, description) {
  assert.ok(
    geometry !== null,
    `${description} omitted its annotation overlay.`,
  );
  for (const property of ["height", "left", "top", "width"]) {
    assert.ok(
      Math.abs(geometry.actual[property] - geometry.expected[property]) < 1.5,
      `${description} ${property} did not track the contained image: ${JSON.stringify(geometry)}.`,
    );
  }
}

async function attemptLetterboxStroke(client) {
  const selector = `${sectionSelector(apertureEvidenceSectionId)} .review-artifact-stage`;
  const point = await evaluate(
    client,
    `(() => {
      const stage = document.querySelector(${JSON.stringify(selector)});
      const overlay = stage?.querySelector('[data-workspace-normalized-stroke-surface]');
      if (!(stage instanceof HTMLElement) || !(overlay instanceof SVGSVGElement)) {
        return null;
      }
      const stageBox = stage.getBoundingClientRect();
      const overlayBox = overlay.getBoundingClientRect();
      if (overlayBox.left - stageBox.left > 4) {
        return { x: (stageBox.left + overlayBox.left) / 2, y: stageBox.top + stageBox.height / 2 };
      }
      if (overlayBox.top - stageBox.top > 4) {
        return { x: stageBox.left + stageBox.width / 2, y: (stageBox.top + overlayBox.top) / 2 };
      }
      return null;
    })()`,
  );
  assert.ok(
    point !== null,
    "The aperture section did not expose a letterbox margin.",
  );
  await client.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
    x: point.x,
    y: point.y,
  });
  await client.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    type: "mouseMoved",
    x: point.x + 2,
    y: point.y + 2,
  });
  await client.send("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x: point.x + 2,
    y: point.y + 2,
  });
  const drew = await evaluate(
    client,
    `document.querySelector(${JSON.stringify(`${sectionSelector(apertureEvidenceSectionId)} [data-workspace-normalized-stroke], ${sectionSelector(apertureEvidenceSectionId)} [data-workspace-normalized-stroke-draft]`)}) !== null`,
  );
  assert.equal(drew, false, "A letterbox gesture created artifact feedback.");
}

async function choiceActionLayout(client, sectionId) {
  return evaluate(
    client,
    `(() => {
      const section = document.querySelector(${JSON.stringify(sectionSelector(sectionId))});
      const actions = section?.querySelector(".review-choice-actions");
      if (!(section instanceof HTMLElement) || !(actions instanceof HTMLElement)) {
        return null;
      }
      const sectionBounds = section.getBoundingClientRect();
      const actionBounds = actions.getBoundingClientRect();
      return {
        actionBottom: actionBounds.bottom,
        actionLeft: actionBounds.left,
        actionRight: actionBounds.right,
        sectionBottom: sectionBounds.bottom,
        sectionLeft: sectionBounds.left,
        sectionRight: sectionBounds.right,
      };
    })()`,
  );
}

function assertChoiceActionsInside(layout, label) {
  assert.ok(layout !== null, `${label} action row did not render.`);
  assert.ok(
    layout.actionBottom <= layout.sectionBottom + 1 &&
      layout.actionLeft >= layout.sectionLeft - 1 &&
      layout.actionRight <= layout.sectionRight + 1,
    `${label} action row escaped its section: ${JSON.stringify(layout)}.`,
  );
}

async function captureScreenshot(client, outputPath) {
  const screenshot = await client.send("Page.captureScreenshot", {
    captureBeyondViewport: false,
    format: "png",
    fromSurface: true,
  });
  assert.equal(typeof screenshot.data, "string");
  writeFileSync(outputPath, screenshot.data, "base64");
  assert.ok(statSync(outputPath).size > 1_000);
}

async function reloadPage(client) {
  const loaded = client.waitForEvent(
    "Page.loadEventFired",
    timeoutMilliseconds,
  );
  await client.send("Page.reload", { ignoreCache: true });
  await loaded;
  await waitFor(
    client,
    "the reloaded live Review workspace",
    `document.querySelector(".review-live")?.textContent?.includes("Auto-updating") === true &&
      document.querySelector(${JSON.stringify(sectionSelector(completionSectionId))}) !== null`,
  );
}

async function exerciseBrowser(client, origin, resultDirectory) {
  const loaded = client.waitForEvent(
    "Page.loadEventFired",
    timeoutMilliseconds,
  );
  await client.send("Page.navigate", { url: origin });
  await loaded;
  await waitFor(
    client,
    "the connected Review workspace",
    `document.querySelector(".review-live")?.textContent?.includes("Auto-updating") === true &&
      document.querySelector(${JSON.stringify(sectionSelector(completionSectionId))}) !== null &&
      document.querySelector(${JSON.stringify(sectionSelector(matrixSectionId))}) !== null &&
      document.querySelector(${JSON.stringify(sectionSelector(artifactChoiceSectionId))}) !== null &&
      document.querySelector('[data-section-id] [aria-label^="Color tag "]') === null &&
      document.querySelector('.review-app-actions > button') === null &&
      Array.from(document.querySelectorAll('[role="tab"]')).some(
        (candidate) => candidate.textContent?.trim() === "Current" &&
          candidate.getAttribute('aria-selected') === 'true',
      ) &&
      Array.from(document.querySelectorAll('[role="tab"]')).some(
        (candidate) => candidate.textContent?.trim() === "Old" &&
          candidate.getAttribute('aria-selected') === 'false',
      )`,
  );
  const initial = await jsonRequest(origin, "/api/v1/review");
  assert.equal(initial.revision, 1);
  assert.equal(initial.requests.length, 3);
  assert.equal(
    initial.requests.flatMap((request) => request.assessments).length,
    6,
  );
  const unresolvedEvidence = initial.requests
    .flatMap((request) => request.evidence)
    .filter((evidence) => evidence.status !== "resolved");
  assert.deepEqual(
    unresolvedEvidence,
    [],
    `Review fixture evidence did not resolve: ${JSON.stringify(unresolvedEvidence)}`,
  );

  await clickSectionButton(
    client,
    completionSectionId,
    "No database migration is required",
  );
  await waitFor(
    client,
    "the imported model and harness assessments",
    `(() => {
      const section = document.querySelector(${JSON.stringify(sectionSelector(completionSectionId))});
      const text = section?.textContent ?? "";
      return text.includes("GPT-5.5 · Codex") &&
        text.includes("Claude Sonnet 4.5 · Claude Code");
    })()`,
  );
  assert.equal(
    await evaluate(
      client,
      'document.querySelector(".setta-workspace-section-attention-active") === null',
    ),
    true,
    "Review rendered an unexplained animated attention outline.",
  );
  const completionNote = "Accepted after checking the audit sink caveat.";
  await fillSectionControl(
    client,
    completionSectionId,
    'input[aria-label="Note for No database migration is required"]',
    completionNote,
  );
  await clickSectionButton(client, completionSectionId, "Accept");
  const afterCompletion = await waitForSnapshot(
    origin,
    "the persisted completion decision",
    (snapshot) => {
      const response = requestSnapshot(snapshot, completionRequestId).response;
      return (
        snapshot.revision === initial.revision + 1 &&
        response?.type === "completion" &&
        response.completion.decisions.some(
          (decision) =>
            decision.claimId === "no-migration" &&
            decision.decision === "accepted" &&
            decision.rationale === completionNote,
        )
      );
    },
  );
  await waitFor(
    client,
    "the visible human completion decision",
    `(() => {
      const section = document.querySelector(${JSON.stringify(sectionSelector(completionSectionId))});
      const row = Array.from(section?.querySelectorAll(".review-claim-row") ?? []).find(
        (candidate) => candidate.querySelector("strong")?.textContent?.trim() ===
          "No database migration is required",
      );
      const action = section?.querySelector('button[data-decision-kind="accepted"]');
      return row?.getAttribute("data-decision") === "accepted" &&
        row.textContent?.includes("✓ Accepted") === true &&
        action?.getAttribute("aria-pressed") === "true" &&
        action.textContent?.includes("Accepted") === true;
    })()`,
  );
  await focusSectionFromOutline(client, completionSectionId);
  await clickWorkspaceControl(client, "zoom out");
  const completionScreenshot = path.join(
    resultDirectory,
    "review-completion.png",
  );
  await captureScreenshot(client, completionScreenshot);
  await scrollSectionHorizontally(client, checkoutLogSectionId);

  await clickSectionButton(client, matrixSectionId, "Rollout");
  await waitFor(
    client,
    "the matrix factor-to-code focus",
    `(() => {
      const matrix = document.querySelector(${JSON.stringify(sectionSelector(matrixSectionId))});
      const evidence = document.querySelector(${JSON.stringify(sectionSelector(eventPublisherSectionId))});
      const factor = Array.from(matrix?.querySelectorAll("thead button") ?? []).find(
        (candidate) => candidate.textContent?.trim() === "Rollout",
      );
      const locations = Array.from(evidence?.querySelectorAll(".review-evidence-locations code") ?? [])
        .map((candidate) => candidate.textContent?.trim());
      const editor = evidence?.querySelector('[data-workspace-section-editor="read-only"]');
      return factor?.getAttribute("aria-pressed") === "true" &&
        evidence?.querySelector(".review-evidence")?.hasAttribute("data-focused") === true &&
        locations.includes("Lines 1–7") &&
        editor?.textContent?.includes("events.set(topic, event)") === true;
    })()`,
  );

  await clickSectionButton(client, matrixSectionId, "Mismatch");
  await waitFor(
    client,
    "the matrix factor-to-evidence focus",
    `(() => {
      const matrix = document.querySelector(${JSON.stringify(sectionSelector(matrixSectionId))});
      const evidence = document.querySelector(${JSON.stringify(sectionSelector(shadowEvidenceSectionId))});
      const factor = Array.from(matrix?.querySelectorAll("thead button") ?? []).find(
        (candidate) => candidate.textContent?.trim() === "Mismatch",
      );
      const pointers = Array.from(evidence?.querySelectorAll(".review-evidence-locations code") ?? [])
        .map((candidate) => candidate.textContent?.trim());
      const editor = evidence?.querySelector('[data-workspace-section-editor="read-only"]');
      return factor?.getAttribute("aria-pressed") === "true" &&
        evidence?.querySelector(".review-evidence")?.hasAttribute("data-focused") === true &&
        pointers.includes("/mismatch_rate") && pointers.includes("/mismatches") &&
        editor?.textContent?.includes("mismatch_rate") === true &&
        evidence?.querySelector("diffs-container") === null;
    })()`,
  );
  assertChoiceActionsInside(
    await choiceActionLayout(client, matrixSectionId),
    "The matrix",
  );
  await clickSectionButton(client, matrixSectionId, "A · Immediate cutover");
  await waitFor(
    client,
    "the provisional matrix choice",
    `(() => {
      const section = document.querySelector(${JSON.stringify(sectionSelector(matrixSectionId))});
      return Array.from(section?.querySelectorAll(".review-option-button") ?? []).some(
        (button) => button.querySelector("strong")?.textContent?.trim() ===
          "A · Immediate cutover" && button.getAttribute("aria-pressed") === "true",
      );
    })()`,
  );
  await clickSectionButton(client, matrixSectionId, "Confirm choice");
  const afterMatrix = await waitForSnapshot(
    origin,
    "the confirmed matrix choice",
    (snapshot) => {
      const response = requestSnapshot(snapshot, matrixRequestId).response;
      return (
        snapshot.revision === afterCompletion.revision + 1 &&
        response?.type === "choice" &&
        response.status === "final" &&
        response.choice.outcome === "selected" &&
        response.choice.optionIds[0] === "immediate"
      );
    },
  );
  await waitFor(
    client,
    "the finalized matrix leaving Current",
    `document.querySelector(${JSON.stringify(sectionSelector(matrixSectionId))}) === null`,
  );
  await clickSavedViewTab(client, "Old");
  await waitFor(
    client,
    "the finalized matrix appearing in Old",
    `document.querySelector(${JSON.stringify(sectionSelector(matrixSectionId))}) !== null &&
      document.querySelector(${JSON.stringify(sectionSelector(completionSectionId))}) === null &&
      document.querySelector(${JSON.stringify(sectionSelector(artifactChoiceSectionId))}) === null`,
  );
  await waitFor(
    client,
    "the persistent confirmed matrix choice",
    `(() => {
      const section = document.querySelector(${JSON.stringify(sectionSelector(matrixSectionId))});
      const row = Array.from(section?.querySelectorAll("tbody tr") ?? []).find(
        (candidate) => candidate.querySelector("strong")?.textContent?.trim() ===
          "A · Immediate cutover",
      );
      const action = section?.querySelector('button[data-action-state="confirmed"]');
      return row?.getAttribute("data-confirmed") === "true" &&
        row.textContent?.includes("Your choice") === true &&
        action?.getAttribute("aria-pressed") === "true" &&
        action.textContent?.includes("Choice confirmed") === true;
    })()`,
  );
  await focusSectionFromOutline(client, matrixSectionId);
  await clickWorkspaceControl(client, "zoom out");
  await clickWorkspaceControl(client, "zoom out");
  await clickWorkspaceControl(client, "zoom out");
  const matrixScreenshot = path.join(
    resultDirectory,
    "review-matrix-evidence.png",
  );
  await captureScreenshot(client, matrixScreenshot);
  await clickWorkspaceControl(client, "fit view");
  await clickSavedViewTab(client, "Current");
  await waitFor(
    client,
    "the unfinished artifact choice returning in Current",
    `document.querySelector(${JSON.stringify(sectionSelector(artifactChoiceSectionId))}) !== null &&
      document.querySelector(${JSON.stringify(sectionSelector(matrixSectionId))}) === null`,
  );

  assertChoiceActionsInside(
    await choiceActionLayout(client, artifactChoiceSectionId),
    "The artifact choice",
  );

  await clickSectionButton(client, artifactChoiceSectionId, "C · Aperture");
  await waitFor(
    client,
    "the selected aperture candidate",
    `(() => {
      const choice = document.querySelector(${JSON.stringify(sectionSelector(artifactChoiceSectionId))});
      const artifact = document.querySelector(${JSON.stringify(sectionSelector(apertureEvidenceSectionId))});
      const option = Array.from(choice?.querySelectorAll(".review-artifact-options button") ?? []).find(
        (button) => button.querySelector("strong")?.textContent?.trim() === "C · Aperture",
      );
      const image = artifact?.querySelector(".review-artifact-stage img");
      const artifactBody = artifact?.querySelector(".review-artifact");
      return option?.getAttribute("aria-pressed") === "true" &&
        artifactBody instanceof HTMLElement &&
        getComputedStyle(artifactBody).boxShadow === "none" &&
        image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0;
    })()`,
  );
  const canvasGeometry = await waitForValue(
    "the contained aperture annotation geometry",
    () =>
      artifactOverlayGeometry(
        client,
        sectionSelector(apertureEvidenceSectionId),
      ),
    (geometry) => geometry !== null,
  );
  assertArtifactOverlayGeometry(canvasGeometry, "The canvas artifact");
  assert.ok(
    canvasGeometry.margin > 4,
    "The canvas artifact did not exercise letterboxing.",
  );
  const apertureSource = await evaluate(
    client,
    `(() => {
      const section = document.querySelector(${JSON.stringify(sectionSelector(apertureEvidenceSectionId))});
      const image = section?.querySelector(".review-artifact-stage img");
      return image instanceof HTMLImageElement ? image.currentSrc : null;
    })()`,
  );
  assert.equal(typeof apertureSource, "string");
  assert.notEqual(apertureSource, "");
  await clickSectionButton(
    client,
    apertureEvidenceSectionId,
    "Open section in floating window",
  );
  await waitFor(
    client,
    "the floating aperture candidate window",
    `(() => {
      const windowSurface = document.querySelector('article[aria-label="Window C · Aperture"]');
      const image = windowSurface?.querySelector(".review-artifact-stage img");
      const placeholder = document.querySelector(
        ${JSON.stringify(`${sectionSelector(apertureEvidenceSectionId)} [data-workspace-section-window-placeholder="true"]`)},
      );
      const bounds = windowSurface?.getBoundingClientRect();
      return bounds !== undefined && bounds.width > 0 && bounds.height > 0 &&
        bounds.left < innerWidth && bounds.right > 0 &&
        bounds.top < innerHeight && bounds.bottom > 0 &&
        image instanceof HTMLImageElement && image.complete && image.naturalWidth > 0 &&
        image.currentSrc === ${JSON.stringify(apertureSource)} && placeholder !== null;
    })()`,
  );
  const floatingGeometry = await waitForValue(
    "the resized floating annotation geometry",
    () =>
      artifactOverlayGeometry(
        client,
        'article[aria-label="Window C · Aperture"]',
      ),
    (geometry) => geometry !== null,
  );
  assertArtifactOverlayGeometry(floatingGeometry, "The floating artifact");
  const floatingWindowScreenshot = path.join(
    resultDirectory,
    "review-floating-window.png",
  );
  await captureScreenshot(client, floatingWindowScreenshot);
  await clickElementCenter(
    client,
    'article[aria-label="Window C · Aperture"] button[aria-label="Show C · Aperture in canvas"]',
    "the floating aperture return-to-canvas action",
  );
  await waitFor(
    client,
    "the aperture candidate returned to the canvas",
    `(() => {
      const windowSurface = document.querySelector('article[aria-label="Window C · Aperture"]');
      const section = document.querySelector(${JSON.stringify(sectionSelector(apertureEvidenceSectionId))});
      const image = section?.querySelector(".review-artifact-stage img");
      return windowSurface === null && image instanceof HTMLImageElement &&
        image.complete && image.naturalWidth > 0 &&
        image.currentSrc === ${JSON.stringify(apertureSource)};
    })()`,
  );
  await clickSectionButton(client, apertureEvidenceSectionId, "Draw feedback");
  await attemptLetterboxStroke(client);
  await drawArtifactStroke(client);
  await clickSectionButton(client, apertureEvidenceSectionId, "Finish drawing");
  await clickSectionButton(client, artifactChoiceSectionId, "Request changes");
  const revisionText = "Increase the headline contrast inside the marked area.";
  await fillSectionControl(
    client,
    artifactChoiceSectionId,
    'textarea[aria-label="Requested changes"]',
    revisionText,
  );
  await reloadPage(client);
  await clickSectionButton(client, artifactChoiceSectionId, "C · Aperture");
  await waitFor(
    client,
    "the unsubmitted feedback and drawing restored after reload",
    `document.querySelector(${JSON.stringify(`${sectionSelector(artifactChoiceSectionId)} textarea[aria-label="Requested changes"]`)})?.value === ${JSON.stringify(revisionText)} &&
      document.querySelector(${JSON.stringify(`${sectionSelector(apertureEvidenceSectionId)} [data-workspace-normalized-stroke]`)}) !== null`,
  );
  await clickSectionButton(client, artifactChoiceSectionId, "Send feedback");
  const afterArtifact = await waitForSnapshot(
    origin,
    "the artifact-anchored revision request",
    (snapshot) =>
      isArtifactRevisionSnapshot(
        snapshot,
        afterMatrix.revision + 1,
        revisionText,
      ),
  );
  await waitFor(
    client,
    "the finalized artifact review leaving Current",
    `document.querySelector(${JSON.stringify(sectionSelector(artifactChoiceSectionId))}) === null`,
  );
  await clickSavedViewTab(client, "Old");
  await waitFor(
    client,
    "the finalized artifact review appearing in Old",
    `document.querySelector(${JSON.stringify(sectionSelector(artifactChoiceSectionId))}) !== null &&
      document.querySelector(${JSON.stringify(sectionSelector(matrixSectionId))}) !== null`,
  );
  await waitFor(
    client,
    "the persistent revision-request state",
    `(() => {
      const section = document.querySelector(${JSON.stringify(sectionSelector(artifactChoiceSectionId))});
      const action = section?.querySelector('button[data-action-state="changes-requested"]');
      return action?.getAttribute("aria-pressed") === "true" &&
        action.textContent?.includes("Changes requested") === true;
    })()`,
  );

  const normalScreenshot = path.join(resultDirectory, "review-normal.png");
  await captureScreenshot(client, normalScreenshot);

  await reloadPage(client);
  await clickSectionButton(
    client,
    completionSectionId,
    "No database migration is required",
  );
  await waitFor(
    client,
    "the completion decision after reload",
    `(() => {
      const section = document.querySelector(${JSON.stringify(sectionSelector(completionSectionId))});
      const input = section?.querySelector(
        'input[aria-label="Note for No database migration is required"]',
      );
      const row = Array.from(section?.querySelectorAll(".review-claim-row") ?? []).find(
        (candidate) => candidate.querySelector("strong")?.textContent?.trim() ===
          "No database migration is required",
      );
      return input instanceof HTMLInputElement && input.value === ${JSON.stringify(completionNote)} &&
        row?.getAttribute("data-decision") === "accepted" &&
        row.textContent?.includes("✓ Accepted") === true;
    })()`,
  );
  await clickSavedViewTab(client, "Old");
  await waitFor(
    client,
    "the matrix choice after reload",
    `(() => {
      const section = document.querySelector(${JSON.stringify(sectionSelector(matrixSectionId))});
      return Array.from(section?.querySelectorAll(".review-option-button") ?? []).some(
        (button) => button.querySelector("strong")?.textContent?.trim() ===
          "A · Immediate cutover" && button.getAttribute("aria-pressed") === "true" &&
          button.textContent?.includes("Your choice"),
      ) && section?.querySelector('button[data-action-state="confirmed"]')?.getAttribute(
        "aria-pressed",
      ) === "true";
    })()`,
  );
  await clickSectionButton(client, artifactChoiceSectionId, "C · Aperture");
  await waitFor(
    client,
    "the persisted artifact drawing after reload",
    `document.querySelector(${JSON.stringify(`${sectionSelector(apertureEvidenceSectionId)} [data-workspace-normalized-stroke-surface] [data-workspace-normalized-stroke]`)}) !== null`,
  );

  await client.send("Emulation.setDeviceMetricsOverride", {
    deviceScaleFactor: 1,
    height: 720,
    mobile: false,
    width: 680,
  });
  await waitFor(
    client,
    "the constrained Review viewport",
    `innerWidth === 680 && innerHeight === 720 &&
      document.documentElement.scrollWidth <= document.documentElement.clientWidth &&
      document.querySelector(".review-app")?.getBoundingClientRect().width === 680`,
  );
  await delay(350);
  await clickSectionButton(client, matrixSectionId, "v2 consumers");
  await waitFor(
    client,
    "the constrained factor-to-evidence presentation",
    `(() => {
      const matrix = document.querySelector(${JSON.stringify(sectionSelector(matrixSectionId))});
      const evidence = document.querySelector(${JSON.stringify(sectionSelector(consumerEvidenceSectionId))});
      const header = document.querySelector(".review-app-bar");
      const headerBounds = header?.getBoundingClientRect();
      const factor = Array.from(matrix?.querySelectorAll("thead button") ?? []).find(
        (candidate) => candidate.textContent?.trim() === "v2 consumers",
      );
      return factor?.getAttribute("aria-pressed") === "true" &&
        evidence?.querySelector(".review-evidence")?.hasAttribute("data-focused") === true &&
        headerBounds?.left === 0 && headerBounds.right <= innerWidth &&
        document.querySelector(".review-app-actions > button") === null &&
        document.documentElement.scrollWidth <= document.documentElement.clientWidth;
    })()`,
  );
  const constrainedScreenshot = path.join(
    resultDirectory,
    "review-constrained.png",
  );
  await captureScreenshot(client, constrainedScreenshot);

  return {
    revision: afterArtifact.revision,
    screenshots: [
      completionScreenshot,
      matrixScreenshot,
      floatingWindowScreenshot,
      normalScreenshot,
      constrainedScreenshot,
    ],
  };
}

function resultDirectory() {
  const configured = process.env.CODE_POLISHY_ARTIFACT_DIR;
  if (configured !== undefined) {
    if (!path.isAbsolute(configured)) {
      throw new Error("CODE_POLISHY_ARTIFACT_DIR must be absolute.");
    }
    mkdirSync(configured, { recursive: true });
    return configured;
  }
  return mkdtempSync(path.join(os.tmpdir(), "setta-review-browser-result-"));
}

const temporaryDirectory = mkdtempSync(
  path.join(os.tmpdir(), "setta-review-browser-"),
);
const projectRoot = path.join(temporaryDirectory, "project");
const binaryPath = path.join(
  temporaryDirectory,
  process.platform === "win32" ? "review.exe" : "review",
);
const artifacts = resultDirectory();
let server = null;
let browser = null;
let client = null;
let result = null;

try {
  buildSurface(binaryPath);
  const baseRevision = seedProject(projectRoot, binaryPath);
  server = startServer(binaryPath, projectRoot);
  const origin = await waitForServer(server);
  const explicitChrome =
    process.env.REVIEW_CHROME_BINARY ??
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
      height: 900,
      mobile: false,
      width: 1_440,
    }),
  ]);
  const issues = collectBrowserIssues(client);
  try {
    result = await exerciseBrowser(client, origin, artifacts);
  } catch (error) {
    try {
      await captureScreenshot(
        client,
        path.join(artifacts, "review-failure.png"),
      );
    } catch {}
    throw new Error(
      `${error instanceof Error ? error.message : String(error)} Browser issues: ${JSON.stringify(issues)}`,
      { cause: error },
    );
  }
  assert.deepEqual(issues, [], "Review reported browser errors.");
  result.baseRevision = baseRevision;
  result.version = 1;
  writeFileSync(
    path.join(artifacts, "result.json"),
    `${JSON.stringify(result, null, 2)}\n`,
    "utf8",
  );
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

process.stdout.write(
  `${JSON.stringify({ artifacts, result, status: "passed" })}\n`,
);
