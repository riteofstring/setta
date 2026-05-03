#!/usr/bin/env node

import { spawn, spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../frontend/package.json", import.meta.url));
const { chromium } = require("@playwright/test");

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..");
const artifactRoot = path.join(
  repoRoot,
  "perf",
  "visual-fidelity",
  "2026-05-05-gpuflow-full-scene",
);
const worktreeRoot = path.resolve(
  repoRoot,
  "..",
  "setta-visual-fidelity-worktrees",
);
const browserFlags = [
  "--enable-blink-features=CanvasDrawElement",
  "--enable-unsafe-webgpu",
  "--enable-webgpu-developer-features",
];
if (process.platform === "darwin") {
  browserFlags.push("--use-mock-keychain");
}
const chromeExecutablePath = resolveChromeExecutablePath();
const chromeVersion = resolveChromeVersion(chromeExecutablePath);

const runs = [
  {
    label: "baseline-primary",
    ref: "37bdaa5efed8fb8d86425ecfa43fc85f61d0d08d",
    role: "primary baseline",
    worktree: path.join(worktreeRoot, "gpuflow-baseline-primary"),
  },
  {
    label: "candidate",
    ref: "7909db3928a9d2bdd42f2371a1f98acb17b8902f",
    role: "canvas candidate",
    worktree: path.join(worktreeRoot, "gpuflow-candidate"),
  },
  {
    label: "baseline-secondary",
    optional: true,
    ref: "6b6036f456ad8a093cd3a364870d6ee1632b376b",
    role: "optional context baseline",
    worktree: path.join(worktreeRoot, "gpuflow-baseline-secondary"),
  },
];

const viewports = [
  { height: 900, id: "desktop", width: 1440 },
  { height: 768, id: "compact-desktop", width: 1024 },
  { height: 844, id: "narrow", width: 390 },
];

const controlSections = [
  {
    capture: true,
    codeObjType: "DropdownParam",
    config: { choices: ["Alpha", "Beta", "Gamma", "Delta"] },
    id: "dropdown",
    name: "VF Dropdown",
    value: "Beta",
    x: 40,
    y: 40,
  },
  {
    capture: true,
    codeObjType: "ColorPickerParam",
    config: {
      colorChoices: [
        { color: "#ef4444", description: "Red" },
        { color: "#10b981", description: "Green" },
        { color: "#3b82f6", description: "Blue" },
      ],
    },
    id: "color",
    name: "VF Color",
    value: "#10b981",
    x: 420,
    y: 40,
  },
  {
    capture: true,
    codeObjType: "DateParam",
    config: {
      dateCalendarWeekStart: "sunday",
      dateControlMode: "calendar",
      dateDisplayFormat: "us",
      dateIncludesTime: false,
      dateSelectionMode: "single",
    },
    id: "calendar",
    name: "VF Calendar",
    value: "2026-05-05",
    x: 800,
    y: 40,
  },
  {
    capture: true,
    codeObjType: "SliderParam",
    config: { max: 100, min: 0, step: 5 },
    id: "slider",
    name: "VF Slider",
    value: "45",
    x: 40,
    y: 230,
  },
  {
    capture: true,
    codeObjType: "RotaryParam",
    config: { max: 100, min: 0, step: 5 },
    id: "rotary",
    name: "VF Rotary",
    value: "65",
    x: 420,
    y: 230,
  },
  {
    capture: true,
    codeObjType: "SwitchParam",
    id: "switch",
    name: "VF Switch",
    value: "true",
    x: 800,
    y: 230,
  },
  {
    capture: true,
    codeObjType: "PasswordParam",
    id: "password",
    name: "VF Password",
    value: "visual-secret",
    x: 40,
    y: 420,
  },
  {
    capture: true,
    codeObjType: "ButtonParam",
    config: {
      actionMode: "HTTP_REQUEST",
      label: "Run Checkpoint",
      requestBody: "",
      requestHeaderKey: "",
      requestHeaderValue: "",
      requestMethod: "GET",
      requestUrl: "",
    },
    id: "button",
    name: "VF Button",
    x: 420,
    y: 420,
  },
  {
    capture: true,
    codeObjType: "DropzoneParam",
    config: {
      maxAttachments: 3,
      placeholder: "Drop checkpoint files",
    },
    id: "dropzone",
    name: "VF Dropzone",
    size: { height: 160, width: 360 },
    x: 800,
    y: 420,
  },
  {
    codeObjType: "TextParam",
    id: "text",
    name: "VF Text",
    value: "Native text island",
    x: 1180,
    y: 40,
  },
];

const fixtureDefinitions = [
  {
    description: "Full project surface with closed canvas/DOM controls.",
    id: "project-surface",
    requiredSelectors: [".setta-gpu-flow__pane"],
  },
  {
    description: "Closed param-control grid.",
    id: "param-controls-closed",
    requiredSelectors: [".setta-gpu-flow__pane"],
  },
  {
    description: "Dense dict param rows and scrolling surface.",
    id: "dense-param-dict",
    requiredSelectors: ["section/dict-section"],
  },
  {
    description: "Callable section with param rows and connection handles.",
    id: "callable-edge-handles",
    requiredSelectors: ["section/callable-section"],
  },
  {
    description: "Selected section and resize affordances.",
    id: "selection-resize",
    requiredSelectors: ["section/slider"],
  },
  {
    description: "Dropdown popup open state.",
    id: "dropdown-open",
    requiredSelectors: ["section/dropdown"],
  },
  {
    description: "Configured color picker popup open state.",
    id: "color-picker-open",
    requiredSelectors: ["section/color"],
  },
  {
    description: "Date calendar popup open state.",
    id: "date-calendar-open",
    requiredSelectors: ["section/calendar"],
  },
  {
    description: "Focused native text/editor island.",
    id: "native-text-island",
    requiredSelectors: ["section/text"],
  },
  {
    description: "Drag preview while moving a section.",
    id: "drag-preview",
    requiredSelectors: ["section/rotary"],
  },
];

const manifest = {
  artifactRoot,
  browserExecutablePath: chromeExecutablePath,
  browserFlags,
  browserVersion: chromeVersion,
  captureStartedAt: new Date().toISOString(),
  fixtureDefinitions,
  runs: [],
  viewports,
};
const reviewRows = [];

async function main() {
  const includeSecondary = process.argv.includes("--include-secondary");
  const selectedRuns = runs.filter((run) => includeSecondary || !run.optional);
  await mkdir(artifactRoot, { recursive: true });
  await mkdir(path.join(artifactRoot, "diffs"), { recursive: true });
  await mkdir(path.join(artifactRoot, "runtime"), { recursive: true });

  for (const run of selectedRuns) {
    verifyWorktreeRef(run);
    await captureRun(run);
  }

  await comparePrimaryAndCandidate();
  manifest.captureFinishedAt = new Date().toISOString();
  await writeFile(
    path.join(artifactRoot, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  await writeReview();
  console.log(`GpuFlow visual fidelity artifacts: ${artifactRoot}`);
}

function resolveChromeExecutablePath() {
  const result = spawnSync(
    path.join(repoRoot, "scripts", "resolve-chrome-for-testing-149.sh"),
    [],
    {
      cwd: repoRoot,
      encoding: "utf8",
      env: process.env,
    },
  );
  if (result.status !== 0) {
    throw new Error(
      `Failed to resolve Chrome for Testing 149: ${result.stderr || result.stdout}`,
    );
  }
  const executablePath = result.stdout.trim();
  if (executablePath.length === 0) {
    throw new Error("Chrome for Testing 149 resolver returned an empty path.");
  }
  return executablePath;
}

function resolveChromeVersion(executablePath) {
  const result = spawnSync(executablePath, ["--version"], {
    cwd: repoRoot,
    encoding: "utf8",
    env: process.env,
  });
  if (result.status !== 0) {
    throw new Error(
      `Failed to inspect Chrome version at ${executablePath}: ${
        result.stderr || result.stdout
      }`,
    );
  }
  return result.stdout.trim();
}

function launchCheckpointBrowser() {
  return chromium.launch({
    args: browserFlags,
    executablePath: chromeExecutablePath,
    headless: true,
  });
}

function verifyWorktreeRef(run) {
  const result = spawnSync("git", ["rev-parse", "HEAD"], {
    cwd: run.worktree,
    encoding: "utf8",
  });
  if (result.status !== 0) {
    throw new Error(
      `Failed to inspect ${run.label} worktree at ${run.worktree}: ${
        result.stderr || result.stdout
      }`,
    );
  }
  const actualRef = result.stdout.trim();
  if (actualRef !== run.ref) {
    throw new Error(
      `${run.label} worktree is at ${actualRef}, expected ${run.ref}.`,
    );
  }
}

async function captureRun(run) {
  const runArtifactDir = path.join(artifactRoot, run.label);
  await rm(runArtifactDir, { force: true, recursive: true });
  await mkdir(runArtifactDir, { recursive: true });

  const runtimeDir = path.join(artifactRoot, "runtime", run.label);
  await rm(runtimeDir, { force: true, recursive: true });
  await mkdir(runtimeDir, { recursive: true });

  const env = runEnvironment(run, runtimeDir);
  const runRecord = {
    captures: [],
    label: run.label,
    ref: run.ref,
    role: run.role,
    runtimeDir,
    worktree: run.worktree,
  };
  manifest.runs.push(runRecord);

  await runCommand(run.worktree, "./kill.sh", [], env, {
    allowFailure: true,
    logPath: path.join(runArtifactDir, "kill-before.log"),
  });

  const aiLogPath = path.join(runArtifactDir, "ai.log");
  const aiProcess = spawn("./ai.sh", {
    cwd: run.worktree,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const aiLogChunks = [];
  aiProcess.stdout.on("data", (chunk) => aiLogChunks.push(chunk));
  aiProcess.stderr.on("data", (chunk) => aiLogChunks.push(chunk));

  let browser;
  try {
    await waitForHttp(`http://127.0.0.1:${env.SETTA_PORT}`, 120000);
    await waitForHttp(`http://127.0.0.1:${env.SETTA_DEV_FRONTEND_PORT}`, 120000);
    const bootstrapUrl = await resolveBootstrapUrl(run.worktree, env);

    browser = await launchCheckpointBrowser();
    const context = await browser.newContext({
      viewport: { height: 900, width: 1440 },
    });
    const page = await context.newPage();
    const consoleMessages = [];
    const pageErrors = [];
    page.on("console", (msg) => {
      if (["error", "warning"].includes(msg.type())) {
        consoleMessages.push({ text: msg.text(), type: msg.type() });
      }
    });
    page.on("pageerror", (err) => {
      pageErrors.push(err.stack || err.message || String(err));
    });

    await page.goto(bootstrapUrl, { waitUntil: "domcontentloaded" });
    await page.waitForSelector(".setta-titlebar-offset", { timeout: 60000 });
    const project = await createFixtureProject(page, env);
    runRecord.project = project;
    runRecord.bootstrapUrl = scrubBootstrapUrl(bootstrapUrl);

    for (const viewport of viewports) {
      await page.setViewportSize({
        height: viewport.height,
        width: viewport.width,
      });
      await page.waitForTimeout(300);
      await setStableViewport(page);
      await captureViewportFixtures({
        page,
        project,
        run,
        runArtifactDir,
        runRecord,
        viewport,
      });
    }

    runRecord.consoleMessages = consoleMessages;
    runRecord.pageErrors = pageErrors;
    await context.close();
  } finally {
    if (browser) {
      await browser.close().catch(() => null);
    }
    aiProcess.kill("SIGTERM");
    await waitForProcessExit(aiProcess, 5000);
    await writeFile(aiLogPath, Buffer.concat(aiLogChunks));
    await runCommand(run.worktree, "./kill.sh", [], env, {
      allowFailure: true,
      logPath: path.join(runArtifactDir, "kill-after.log"),
    });
  }
}

function runEnvironment(run, runtimeDir) {
  return {
    ...process.env,
    CHROME_BIN: chromeExecutablePath,
    CHROME_EXTRA_ARGS: browserFlags.join(" "),
    DEBUG_PORT: "9277",
    SETTA_DEV_FRONTEND_PORT: "3077",
    SETTA_FILES_ROOT: path.join(runtimeDir, "setta_files"),
    SETTA_HOME: path.join(runtimeDir, ".setta-development"),
    SETTA_NO_OPEN: "1",
    SETTA_PORT: "8077",
  };
}

async function createFixtureProject(page, env) {
  await postBackend(env, "/loadAllProjectMetadata", {});
  const projectName = await postBackend(env, "/createProjectConfig", {
    previewImgColor: "bg-blue-500/60",
  });
  if (typeof projectName !== "string" || projectName.length === 0) {
    throw new Error("Failed to create visual fidelity project.");
  }
  const projectUrl = new URL(
    projectName,
    `http://127.0.0.1:${env.SETTA_DEV_FRONTEND_PORT}/`,
  );
  projectUrl.searchParams.set(
    "__setta_backend_origin",
    `http://127.0.0.1:${env.SETTA_PORT}`,
  );
  await page.goto(projectUrl.toString(), { waitUntil: "domcontentloaded" });
  await waitForReadySurface(page);
  const projectConfigId = await page.evaluate(async () => {
    const { getCurrProjectConfigId } = await import(
      "/src/state/actions/sectionInfos"
    );
    return getCurrProjectConfigId();
  });

  const ids = await createFixtureSections(page, projectConfigId);
  await waitForReadySurface(page);
  await page.waitForTimeout(500);
  return {
    ids,
    positions: resolveFixtureSectionPositions(ids),
    projectConfigId,
    projectName,
  };
}

async function createFixtureSections(page, projectConfigId) {
  const createOperations = [];
  for (const control of controlSections) {
    createOperations.push({
      body: {
        controlCodeObjType: control.codeObjType,
        implOverrides: null,
        implType: "MetaControl",
        name: control.name,
        position: { x: control.x, y: control.y },
        topLevelSections: null,
        viewportBounds: null,
      },
      operationName: "createTopLevelSection",
    });
  }
  createOperations.push({
    body: {
      controlCodeObjType: null,
      implOverrides: null,
      implType: "Dict",
      name: "VF Dense Dict",
      position: { x: 40, y: 650 },
      topLevelSections: null,
      viewportBounds: null,
    },
    operationName: "createTopLevelSection",
  });
  createOperations.push({
    body: {
      controlCodeObjType: null,
      implOverrides: null,
      implType: "Callable",
      name: "VF Callable",
      position: { x: 680, y: 650 },
      topLevelSections: null,
      viewportBounds: null,
    },
    operationName: "createTopLevelSection",
  });

  const created = await applyProjectMutations(page, projectConfigId, createOperations);
  const ids = {};
  controlSections.forEach((control, index) => {
    ids[control.id] = created[index]?.sectionId;
  });
  ids.dict = created[controlSections.length]?.sectionId;
  ids.callable = created[controlSections.length + 1]?.sectionId;
  for (const [key, sectionId] of Object.entries(ids)) {
    if (!sectionId) {
      throw new Error(`Missing section id for ${key}.`);
    }
  }

  const sizePatch = {};
  for (const control of controlSections) {
    if (control.size) {
      sizePatch[ids[control.id]] = control.size;
    } else {
      sizePatch[ids[control.id]] = { height: 150, width: 340 };
    }
  }
  sizePatch[ids.dict] = { height: 420, width: 560 };
  sizePatch[ids.callable] = { height: 420, width: 560 };
  await applyProjectMutations(page, projectConfigId, [
    {
      body: {
        frontendOpId: null,
        sectionSizes: sizePatch,
      },
      operationName: "setSectionSizes",
    },
  ]);

  await applyProjectMutations(page, projectConfigId, [
    ...Array.from({ length: 40 }, () => ({
      body: { sectionId: ids.dict },
      operationName: "addKwarg",
    })),
    {
      body: {
        callableName: "sorted",
        frontendOpId: null,
        refetchParams: true,
        sectionId: ids.callable,
      },
      operationName: "setCallable",
    },
  ]);

  await configureControlParams(page, projectConfigId, ids);
  return ids;
}

function resolveFixtureSectionPositions(ids) {
  const positions = {};
  for (const control of controlSections) {
    positions[ids[control.id]] = { x: control.x, y: control.y };
  }
  positions[ids.dict] = { x: 40, y: 650 };
  positions[ids.callable] = { x: 680, y: 650 };
  return positions;
}

async function configureControlParams(page, projectConfigId, ids) {
  const paramInfo = await resolveMetaControlParamInfo(page, projectConfigId, ids);
  const configOperations = [];
  const valueOperations = [];
  for (const control of controlSections) {
    const info = paramInfo[control.id];
    if (!info) {
      continue;
    }
    if (control.config) {
      configOperations.push({
        body: {
          newConfig: control.config,
          paramInfoId: info.paramId,
          sectionId: info.sectionId,
        },
        operationName: "updateParamImplConfig",
      });
    }
    if (control.value !== undefined) {
      valueOperations.push({
        body: {
          frontendOpId: null,
          paramInfoId: info.paramId,
          sectionId: info.sectionId,
          sectionVariantId: info.variantId,
          value: control.value,
        },
        operationName: "setParamEnteredValue",
      });
    }
  }
  if (configOperations.length) {
    await applyProjectMutations(page, projectConfigId, configOperations);
  }
  if (valueOperations.length) {
    await applyProjectMutations(page, projectConfigId, valueOperations);
  }
}

async function resolveMetaControlParamInfo(page, projectConfigId, ids) {
  const state = await page.evaluate(async () => {
    const { useProjectState } = await import("/src/state/definitions");
    return useProjectState.getState();
  });
  const result = {};
  for (const control of controlSections) {
    const sectionId = ids[control.id];
    const variantId = state.projectConfig?.sectionVariantMap?.[sectionId];
    const implId = state.sectionVariants?.[variantId]?.impl;
    const impl = state.sectionImpls?.[implId];
    const paramId =
      impl?.metaControlParamId ?? Object.keys(impl?.codeObjVariantMap ?? {})[0];
    if (sectionId && variantId && paramId) {
      result[control.id] = { paramId, sectionId, variantId };
    }
  }
  return result;
}

async function applyProjectMutations(page, projectConfigId, operations) {
  return await page.evaluate(
    async ({ operations, projectConfigId }) => {
      const { callOpenAPI, res200 } = await import(
        "/tests/e2e/browserAppSubsystemSdk.ts"
      );
      const openAPI = await import("/src/openapi/http");
      const {
        getCurrProjectConfigId,
        processProjectStateUpdateFromBackend,
      } = await import("/src/state/actions/sectionInfos");

      if (getCurrProjectConfigId() !== projectConfigId) {
        throw new Error(
          `Active project mismatch: expected ${projectConfigId}, got ${getCurrProjectConfigId()}.`,
        );
      }
      const results = [];
      for (const operation of operations) {
        const routeFactory = openAPI[operation.operationName];
        if (typeof routeFactory !== "function") {
          throw new Error(`Missing OpenAPI operation ${operation.operationName}.`);
        }
        const response = await callOpenAPI(
          routeFactory({ body: { ...operation.body, projectConfigId } }),
        );
        if (!res200(response)) {
          throw new Error(
            `OpenAPI operation ${operation.operationName} failed with ${response.status}.`,
          );
        }
        results.push(response.data ?? null);
      }
      const latestResponse = await callOpenAPI(
        openAPI.getLatestProjectState({ body: { projectConfigId } }),
      );
      if (!res200(latestResponse) || !latestResponse.data) {
        throw new Error(
          `Failed to hydrate latest project state: ${latestResponse.status}.`,
        );
      }
      processProjectStateUpdateFromBackend(latestResponse.data);
      return results;
    },
    { operations, projectConfigId },
  );
}

async function captureViewportFixtures({
  page,
  project,
  run,
  runArtifactDir,
  runRecord,
  viewport,
}) {
  await capturePane(page, run, runArtifactDir, runRecord, viewport, "project-surface");
  await capturePane(
    page,
    run,
    runArtifactDir,
    runRecord,
    viewport,
    "param-controls-closed",
  );
  await captureSectionClip({
    fixtureId: "dense-param-dict",
    page,
    position: project.positions[project.ids.dict],
    run,
    runArtifactDir,
    runRecord,
    sectionId: project.ids.dict,
    viewport,
  });
  await captureSectionClip({
    fixtureId: "callable-edge-handles",
    page,
    position: project.positions[project.ids.callable],
    run,
    runArtifactDir,
    runRecord,
    sectionId: project.ids.callable,
    viewport,
  });

  await openSectionVisualState(
    page,
    project.ids.slider,
    project.positions[project.ids.slider],
    "hover",
  );
  await capturePane(page, run, runArtifactDir, runRecord, viewport, "selection-resize");

  await openSectionVisualState(
    page,
    project.ids.dropdown,
    project.positions[project.ids.dropdown],
    "click",
  );
  await capturePane(page, run, runArtifactDir, runRecord, viewport, "dropdown-open");
  await page.keyboard.press("Escape").catch(() => null);
  await page.waitForTimeout(150);

  await openSectionVisualState(
    page,
    project.ids.color,
    project.positions[project.ids.color],
    "click",
  );
  await capturePane(page, run, runArtifactDir, runRecord, viewport, "color-picker-open");
  await page.keyboard.press("Escape").catch(() => null);
  await page.waitForTimeout(150);

  await openSectionVisualState(
    page,
    project.ids.calendar,
    project.positions[project.ids.calendar],
    "click",
  );
  await capturePane(page, run, runArtifactDir, runRecord, viewport, "date-calendar-open");
  await page.keyboard.press("Escape").catch(() => null);
  await page.waitForTimeout(150);

  await openSectionVisualState(
    page,
    project.ids.text,
    project.positions[project.ids.text],
    "click",
  );
  await capturePane(page, run, runArtifactDir, runRecord, viewport, "native-text-island");
  await page.keyboard.press("Escape").catch(() => null);
  await page.waitForTimeout(150);

  await beginSectionDrag(
    page,
    project.ids.rotary,
    project.positions[project.ids.rotary],
  );
  await capturePane(page, run, runArtifactDir, runRecord, viewport, "drag-preview");
  await page.mouse.up().catch(() => null);
  await page.waitForTimeout(150);
}

async function capturePane(page, run, runArtifactDir, runRecord, viewport, fixtureId) {
  const fileName = `${fixtureId}__${viewport.id}__${run.label}.png`;
  const capturePath = path.join(runArtifactDir, fileName);
  const record = {
    fixtureId,
    path: capturePath,
    refLabel: run.label,
    viewport: viewport.id,
  };
  try {
    const pane = page.locator(".setta-gpu-flow__pane, .setta-gpu-flow-root").first();
    await pane.waitFor({ state: "visible", timeout: 30000 });
    await pane.screenshot({ path: capturePath, timeout: 30000 });
    record.status = "captured";
  } catch (err) {
    record.status = "capture-blocked";
    record.error = String(err);
  }
  runRecord.captures.push(record);
}

async function captureSectionClip({
  fixtureId,
  page,
  position,
  run,
  runArtifactDir,
  runRecord,
  sectionId,
  viewport,
}) {
  const fileName = `${fixtureId}__${viewport.id}__${run.label}.png`;
  const capturePath = path.join(runArtifactDir, fileName);
  const record = {
    fixtureId,
    path: capturePath,
    refLabel: run.label,
    sectionId,
    viewport: viewport.id,
  };
  try {
    if (position) {
      await setViewportForFlowPosition(page, position);
    }
    const locator = sectionLocator(page, sectionId).first();
    await locator.waitFor({ state: "visible", timeout: 30000 });
    const box = await locator.boundingBox();
    if (!box || box.width <= 0 || box.height <= 0) {
      throw new Error(`Missing visible box for section ${sectionId}.`);
    }
    await page.screenshot({
      clip: {
        height: Math.min(box.height, 520),
        width: Math.min(box.width, 720),
        x: Math.max(0, box.x),
        y: Math.max(0, box.y),
      },
      path: capturePath,
      timeout: 30000,
    });
    record.status = "captured";
  } catch (err) {
    record.status = "capture-blocked";
    record.error = String(err);
  }
  runRecord.captures.push(record);
}

function sectionLocator(page, sectionId) {
  return page.locator(
    [
      `[data-testid="rf__node-${sectionId}"]`,
      `.setta-gpu-flow__node[data-id="${sectionId}"]`,
      `[data-gpu-flow-node="true"][data-id="${sectionId}"]`,
    ].join(", "),
  );
}

async function openSectionVisualState(page, sectionId, position, action) {
  if (position) {
    await setViewportForFlowPosition(page, position);
  }
  const locator = sectionLocator(page, sectionId).first();
  await locator.waitFor({ state: "visible", timeout: 30000 });
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error(`Cannot interact with missing section ${sectionId}.`);
  }
  if (action === "hover") {
    await page.mouse.move(box.x + box.width * 0.88, box.y + box.height * 0.82);
  } else {
    await page.mouse.click(box.x + box.width * 0.72, box.y + box.height * 0.52);
  }
  await page.waitForTimeout(250);
}

async function beginSectionDrag(page, sectionId, position) {
  if (position) {
    await setViewportForFlowPosition(page, position);
  }
  const locator = sectionLocator(page, sectionId).first();
  await locator.waitFor({ state: "visible", timeout: 30000 });
  const box = await locator.boundingBox();
  if (!box) {
    throw new Error(`Cannot drag missing section ${sectionId}.`);
  }
  await page.mouse.move(box.x + box.width * 0.5, box.y + 24);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5 + 56, box.y + 68, {
    steps: 8,
  });
  await page.waitForTimeout(250);
}

async function setStableViewport(page) {
  await page.evaluate(async () => {
    const { setViewport } = await import("/src/gpuFlow/viewportActions");
    setViewport({ x: 24, y: 16, zoom: 1 }, { duration: 0 });
  });
  await page.waitForTimeout(150);
}

async function setViewportForFlowPosition(page, position) {
  await page.evaluate(async ({ x, y }) => {
    const { setViewport } = await import("/src/gpuFlow/viewportActions");
    setViewport({ x: 40 - x, y: 92 - y, zoom: 1 }, { duration: 0 });
  }, position);
  await page.waitForTimeout(150);
}

async function waitForReadySurface(page) {
  await page.waitForSelector(".setta-gpu-flow__pane, .setta-gpu-flow-root", {
    state: "visible",
    timeout: 60000,
  });
}

async function postBackend(env, route, data) {
  const response = await fetch(`http://127.0.0.1:${env.SETTA_PORT}/api${route}`, {
    body: JSON.stringify(data),
    headers: {
      "Content-Type": "application/json",
      Origin: `http://127.0.0.1:${env.SETTA_DEV_FRONTEND_PORT ?? "3077"}`,
      Referer: `http://127.0.0.1:${env.SETTA_DEV_FRONTEND_PORT ?? "3077"}/`,
    },
    method: "POST",
  });
  if (!response.ok) {
    throw new Error(`${route} failed with ${response.status}: ${await response.text()}`);
  }
  const text = await response.text();
  return text.length ? JSON.parse(text) : null;
}

async function resolveBootstrapUrl(worktree, env) {
  const deadline = Date.now() + 60000;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const result = spawnSync("./scripts/bootstrap-url.sh", {
        cwd: worktree,
        encoding: "utf8",
        env,
      });
      if (result.status === 0 && result.stdout.trim()) {
        return result.stdout.trim();
      }
      lastError = result.stderr || result.stdout;
    } catch (err) {
      lastError = err;
    }
    await delay(500);
  }
  throw new Error(`Timed out resolving bootstrap URL: ${String(lastError)}`);
}

async function comparePrimaryAndCandidate() {
  const baseline = manifest.runs.find((run) => run.label === "baseline-primary");
  const candidate = manifest.runs.find((run) => run.label === "candidate");
  if (!baseline || !candidate) {
    return;
  }
  const candidateByKey = new Map(
    candidate.captures.map((capture) => [
      `${capture.fixtureId}::${capture.viewport}`,
      capture,
    ]),
  );
  const browser = await launchCheckpointBrowser();
  const page = await browser.newPage();
  try {
    for (const referenceCapture of baseline.captures) {
      const key = `${referenceCapture.fixtureId}::${referenceCapture.viewport}`;
      const candidateCapture = candidateByKey.get(key);
      const review = {
        candidatePath: candidateCapture?.path ?? null,
        diffPath: null,
        fixtureId: referenceCapture.fixtureId,
        referencePath: referenceCapture.path,
        status: "capture-blocked",
        viewport: referenceCapture.viewport,
      };
      if (
        referenceCapture.status !== "captured" ||
        candidateCapture?.status !== "captured"
      ) {
        review.reason = `capture missing: reference=${referenceCapture.status}, candidate=${candidateCapture?.status ?? "missing"}`;
        reviewRows.push(review);
        continue;
      }
      const diffFile = path.join(
        artifactRoot,
        "diffs",
        `${referenceCapture.fixtureId}__${referenceCapture.viewport}__candidate-vs-baseline-primary.png`,
      );
      const diff = await compareImages(page, referenceCapture.path, candidateCapture.path);
      review.diff = diff.summary;
      if (diff.diffPngBase64) {
        await writeFile(diffFile, Buffer.from(diff.diffPngBase64, "base64"));
        review.diffPath = diffFile;
      }
      if (!diff.summary.sameDimensions) {
        review.status = "blocking-regression";
        review.reason = "Screenshot dimensions do not match.";
      } else if (
        diff.summary.changedPixelRatio <= 0.02 &&
        diff.summary.meanAbsoluteChannelDelta <= 8
      ) {
        review.status = "pass";
        review.reason = "Automated pixel diff is within checkpoint tolerance.";
      } else {
        review.status = "blocking-regression";
        review.reason = "Automated pixel diff exceeds checkpoint tolerance.";
      }
      reviewRows.push(review);
    }
  } finally {
    await browser.close();
  }
}

async function compareImages(page, referencePath, candidatePath) {
  const [referenceData, candidateData] = await Promise.all([
    readFile(referencePath),
    readFile(candidatePath),
  ]);
  return await page.evaluate(
    async ({ candidateDataUrl, referenceDataUrl }) => {
      const referenceImage = await loadImage(referenceDataUrl);
      const candidateImage = await loadImage(candidateDataUrl);
      const summary = {
        candidateHeight: candidateImage.height,
        candidateWidth: candidateImage.width,
        changedPixelCount: 0,
        changedPixelRatio: 1,
        maxChannelDelta: null,
        meanAbsoluteChannelDelta: null,
        pixelCount: 0,
        referenceHeight: referenceImage.height,
        referenceWidth: referenceImage.width,
        sameDimensions:
          referenceImage.width === candidateImage.width &&
          referenceImage.height === candidateImage.height,
      };
      if (!summary.sameDimensions) {
        return { diffPngBase64: null, summary };
      }
      const width = referenceImage.width;
      const height = referenceImage.height;
      const referenceCanvas = document.createElement("canvas");
      const candidateCanvas = document.createElement("canvas");
      const diffCanvas = document.createElement("canvas");
      referenceCanvas.width = candidateCanvas.width = diffCanvas.width = width;
      referenceCanvas.height = candidateCanvas.height = diffCanvas.height = height;
      const referenceContext = referenceCanvas.getContext("2d", {
        willReadFrequently: true,
      });
      const candidateContext = candidateCanvas.getContext("2d", {
        willReadFrequently: true,
      });
      const diffContext = diffCanvas.getContext("2d");
      referenceContext.drawImage(referenceImage, 0, 0);
      candidateContext.drawImage(candidateImage, 0, 0);
      const referencePixels = referenceContext.getImageData(0, 0, width, height);
      const candidatePixels = candidateContext.getImageData(0, 0, width, height);
      const diffPixels = diffContext.createImageData(width, height);
      let changedPixelCount = 0;
      let maxChannelDelta = 0;
      let totalChannelDelta = 0;
      const pixelCount = width * height;
      for (let offset = 0; offset < referencePixels.data.length; offset += 4) {
        let pixelMaxDelta = 0;
        let pixelTotalDelta = 0;
        for (let channel = 0; channel < 4; channel += 1) {
          const delta = Math.abs(
            referencePixels.data[offset + channel] -
              candidatePixels.data[offset + channel],
          );
          pixelMaxDelta = Math.max(pixelMaxDelta, delta);
          pixelTotalDelta += delta;
          totalChannelDelta += delta;
          maxChannelDelta = Math.max(maxChannelDelta, delta);
        }
        if (pixelMaxDelta > 12) {
          changedPixelCount += 1;
          diffPixels.data[offset] = 239;
          diffPixels.data[offset + 1] = 68;
          diffPixels.data[offset + 2] = 68;
          diffPixels.data[offset + 3] = 255;
        } else {
          const referenceGray =
            (referencePixels.data[offset] +
              referencePixels.data[offset + 1] +
              referencePixels.data[offset + 2]) /
            3;
          const candidateGray =
            (candidatePixels.data[offset] +
              candidatePixels.data[offset + 1] +
              candidatePixels.data[offset + 2]) /
            3;
          const gray = Math.round((referenceGray + candidateGray) / 2);
          diffPixels.data[offset] = gray;
          diffPixels.data[offset + 1] = gray;
          diffPixels.data[offset + 2] = gray;
          diffPixels.data[offset + 3] = 160;
        }
        if (pixelTotalDelta > 0 && pixelMaxDelta <= 12) {
          diffPixels.data[offset + 3] = 190;
        }
      }
      diffContext.putImageData(diffPixels, 0, 0);
      return {
        diffPngBase64: diffCanvas.toDataURL("image/png").split(",", 2)[1],
        summary: {
          ...summary,
          changedPixelCount,
          changedPixelRatio: pixelCount === 0 ? 0 : changedPixelCount / pixelCount,
          maxChannelDelta,
          meanAbsoluteChannelDelta:
            pixelCount === 0 ? 0 : totalChannelDelta / (pixelCount * 4),
          pixelCount,
        },
      };

      function loadImage(src) {
        return new Promise((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = () => reject(new Error(`Failed to load image ${src}`));
          image.src = src;
        });
      }
    },
    {
      candidateDataUrl: `data:image/png;base64,${candidateData.toString("base64")}`,
      referenceDataUrl: `data:image/png;base64,${referenceData.toString("base64")}`,
    },
  );
}

async function writeReview() {
  const blocking = reviewRows.filter((row) => row.status === "blocking-regression");
  const captureBlocked = reviewRows.filter((row) => row.status === "capture-blocked");
  const runtimeBlockers = manifest.runs.flatMap((run) =>
    summarizeMessages(run.pageErrors ?? []).unique.map((entry) => ({
      ...entry,
      runLabel: run.label,
    })),
  );
  const lines = [];
  lines.push("# GpuFlow Visual Fidelity Checkpoint Review");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Browser: ${manifest.browserVersion}`);
  lines.push(`- Browser executable: ${manifest.browserExecutablePath}`);
  lines.push(`- Compared: baseline-primary vs candidate`);
  lines.push(`- Fixtures compared: ${reviewRows.length}`);
  lines.push(`- Pass: ${reviewRows.filter((row) => row.status === "pass").length}`);
  lines.push(`- Blocking regression: ${blocking.length}`);
  lines.push(`- Capture blocked: ${captureBlocked.length}`);
  lines.push(
    `- Runtime page error groups: ${runtimeBlockers.length}`,
  );
  lines.push("");
  lines.push("## Runtime Signals");
  lines.push("");
  for (const run of manifest.runs) {
    const pageErrorSummary = summarizeMessages(run.pageErrors ?? []);
    const consoleSummary = summarizeMessages(
      (run.consoleMessages ?? []).map((message) => message.text ?? ""),
    );
    lines.push(
      `- ${run.label}: ${run.captures.length} captures, ${pageErrorSummary.total} page errors, ${consoleSummary.total} console warnings/errors.`,
    );
    for (const entry of pageErrorSummary.unique.slice(0, 3)) {
      lines.push(`  - page error x${entry.count}: ${escapeListItem(entry.text)}`);
    }
    for (const entry of consoleSummary.unique.slice(0, 3)) {
      lines.push(`  - console x${entry.count}: ${escapeListItem(entry.text)}`);
    }
  }
  lines.push("");
  lines.push("## Fixture Results");
  lines.push("");
  lines.push("| Fixture | Viewport | Status | Reason | Changed Pixels | Mean Delta |");
  lines.push("| --- | --- | --- | --- | ---: | ---: |");
  for (const row of reviewRows) {
    lines.push(
      `| ${row.fixtureId} | ${row.viewport} | ${row.status} | ${escapeTable(
        row.reason ?? "",
      )} | ${formatRatio(row.diff?.changedPixelRatio)} | ${formatNumber(
        row.diff?.meanAbsoluteChannelDelta,
      )} |`,
    );
  }
  lines.push("");
  lines.push("## Prioritized Visual-Fix List");
  lines.push("");
  if (
    blocking.length === 0 &&
    captureBlocked.length === 0 &&
    runtimeBlockers.length === 0
  ) {
    lines.push("- None from automated checkpoint.");
  } else {
    for (const row of [...captureBlocked, ...blocking]) {
      lines.push(
        `- ${row.fixtureId} / ${row.viewport}: ${row.status} - ${
          row.reason ?? "needs review"
        }`,
      );
    }
    for (const entry of runtimeBlockers) {
      lines.push(
        `- ${entry.runLabel}: runtime page error x${entry.count} - ${escapeListItem(
          entry.text,
        )}`,
      );
    }
  }
  lines.push("");
  lines.push("## Notes");
  lines.push("");
  lines.push(
    "- `pass` means the automated pixel diff is within the temporary tolerance.",
  );
  lines.push(
    "- `blocking-regression` means the candidate needs human review or a visual fix before the refactor loop resumes.",
  );
  lines.push(
    "- `capture-blocked` means the screenshot path failed and must be fixed or replaced with another reliable capture method.",
  );
  await writeFile(path.join(artifactRoot, "review.md"), `${lines.join("\n")}\n`);
}

function scrubBootstrapUrl(url) {
  return url.replace(/token=[^&#]+/g, "token=<redacted>");
}

function escapeTable(value) {
  return value.replaceAll("|", "\\|").replace(/\s+/g, " ").trim();
}

function escapeListItem(value) {
  return String(value).replace(/\s+/g, " ").trim();
}

function summarizeMessages(messages) {
  const counts = new Map();
  for (const message of messages) {
    const key = String(message).slice(0, 320);
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return {
    total: messages.length,
    unique: [...counts.entries()]
      .map(([text, count]) => ({ count, text }))
      .sort(
        (left, right) =>
          right.count - left.count || left.text.localeCompare(right.text),
      ),
  };
}

function formatRatio(value) {
  return typeof value === "number" ? value.toFixed(4) : "";
}

function formatNumber(value) {
  return typeof value === "number" ? value.toFixed(2) : "";
}

async function runCommand(cwd, command, args, env, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env,
  });
  if (options.logPath) {
    await writeFile(
      options.logPath,
      `${result.stdout ?? ""}${result.stderr ?? ""}`,
    );
  }
  if (result.status !== 0 && !options.allowFailure) {
    throw new Error(
      `${command} ${args.join(" ")} failed with ${result.status}: ${
        result.stderr || result.stdout
      }`,
    );
  }
  return result.stdout ?? "";
}

async function waitForHttp(url, timeoutMs) {
  const deadline = Date.now() + timeoutMs;
  let lastError = null;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url);
      if (response.status < 500) {
        return;
      }
      lastError = new Error(`${url} responded ${response.status}`);
    } catch (err) {
      lastError = err;
    }
    await delay(500);
  }
  throw new Error(`Timed out waiting for ${url}: ${String(lastError)}`);
}

async function waitForProcessExit(child, timeoutMs) {
  if (child.exitCode !== null) {
    return;
  }
  const exited = await Promise.race([
    new Promise((resolve) => child.once("exit", () => resolve(true))),
    delay(timeoutMs).then(() => false),
  ]);
  if (!exited && child.exitCode === null) {
    child.kill("SIGKILL");
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
