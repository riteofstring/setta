import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { setTimeout as delay } from "node:timers/promises";

import { createCdpPage } from "../lib/cdp-client.mjs";
import {
  startHeadlessChrome,
  stopHeadlessChrome,
  waitForHeadlessChrome,
} from "../lib/headless-chrome.mjs";
import {
  assertBaselineProductSource,
  assertRuntimeReferenceArtifact,
  CAPTURE_SCHEMA_VERSION,
  currentCommit,
  livePlaygroundResponseHashes,
  readRuntimeReferenceManifest,
  resolveCommit,
  runtimeReferenceReceipt,
  sameArtifactHashes,
  workspaceDistArtifactHashes,
} from "../lib/playground-parity-provenance.mjs";
import {
  assertEmptyOutputDirectory,
  createStagingDirectory,
  promoteStagingDirectory,
} from "./artifact-output.mjs";
import {
  evaluate,
  executeAction,
  releaseHeldKey,
  releaseHeldPointer,
  SETTLE_DELAY_MS,
} from "./capture-actions.mjs";
import { captureGeometry } from "./capture-geometry.mjs";
import {
  PLAYGROUND_PARITY_SCENARIOS,
  PLAYGROUND_PARITY_SETUP_ACTIONS,
  PLAYGROUND_PARITY_UNSUPPORTED_STATES,
  PLAYGROUND_PARITY_COVERAGE_LEDGER,
  REQUIRED_SCENARIO_COVERAGE,
  SCENARIO_CATALOG_VERSION,
  selectParityScenarios,
  validateScenarioCatalog,
} from "./scenario-catalog.mjs";

const DEFAULT_URL = "http://localhost:5174/";
const READY_TIMEOUT_MS = 15_000;
const CHROME_START_ATTEMPTS = 3;
const PNG_SIGNATURE = "89504e470d0a1a0a";

function usage() {
  return [
    "Usage: node scripts/xyflow-parity/capture-playground.mjs --mode <baseline|candidate> --output-dir <absolute-directory> [options]",
    "",
    "Options:",
    "  --url <http-url>                 Playground URL, default http://localhost:5174/",
    "  --scenario <id[,id]>             Capture only catalog scenarios by id",
    "  --width <pixels>                 Override each selected scenario width",
    "  --height <pixels>                Override each selected scenario height",
    "  --device-scale-factor <number>   Override the default device scale factor of 1",
    "  --chrome-binary <absolute-path>  Headless Chrome binary",
    "  --reference-commit <full-sha>    Frozen product reference commit",
    "  --runtime-reference-manifest <absolute-path>  Accepted baseline runtime manifest for an unchanged live artifact",
    "  --validate-catalog               Validate the catalog without launching Chrome",
    "  --help                           Show this message",
  ].join("\n");
}

const BOOLEAN_ARGUMENT_SETTERS = new Map([
  [
    "--help",
    (options) => {
      options.help = true;
    },
  ],
  [
    "--validate-catalog",
    (options) => {
      options.validateCatalog = true;
    },
  ],
]);

const VALUE_ARGUMENT_NAMES = new Set([
  "chrome-binary",
  "device-scale-factor",
  "height",
  "mode",
  "output-dir",
  "reference-commit",
  "runtime-reference-manifest",
  "scenario",
  "url",
  "width",
]);

function assignArgumentValue(options, name, value, argument) {
  if (name === "scenario") {
    options.scenarioIds.push(
      ...value
        .split(",")
        .map((id) => id.trim())
        .filter(Boolean),
    );
    return;
  }
  const key = name.replace(/-([a-z])/g, (_match, letter) =>
    letter.toUpperCase(),
  );
  if (options[key] !== null) {
    throw new Error(`${argument} may be supplied only once.`);
  }
  options[key] = value;
}

function parseArguments(argv) {
  const options = {
    chromeBinary: null,
    deviceScaleFactor: null,
    height: null,
    help: false,
    mode: null,
    outputDir: null,
    referenceCommit: null,
    runtimeReferenceManifest: null,
    scenarioIds: [],
    url: null,
    validateCatalog: false,
    width: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    const booleanSetter = BOOLEAN_ARGUMENT_SETTERS.get(argument);
    if (booleanSetter !== undefined) {
      booleanSetter(options);
      continue;
    }
    if (!argument.startsWith("--")) {
      throw new Error(`Unexpected argument: ${argument}.`);
    }
    const name = argument.slice(2);
    if (!VALUE_ARGUMENT_NAMES.has(name)) {
      throw new Error(`Unknown option: ${argument}.`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      throw new Error(`${argument} requires a value.`);
    }
    index += 1;
    assignArgumentValue(options, name, value, argument);
  }
  return options;
}

function requirePositiveInteger(value, name) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive integer.`);
  }
  return parsed;
}

function requirePositiveNumber(value, name) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    throw new Error(`${name} must be a positive number.`);
  }
  return parsed;
}

function validateCaptureMode(mode) {
  if (mode !== "baseline" && mode !== "candidate") {
    throw new Error("--mode must be baseline or candidate.");
  }
}

function normalizeOutputDirectory(outputDirectory) {
  if (outputDirectory === null || !path.isAbsolute(outputDirectory)) {
    throw new Error("--output-dir must be an absolute directory path.");
  }
  return path.resolve(outputDirectory);
}

function normalizeCaptureUrl(value) {
  const url = new URL(value ?? DEFAULT_URL);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("--url must use http or https.");
  }
  return url.href;
}

function validateChromeBinary(chromeBinary) {
  if (chromeBinary !== null && !path.isAbsolute(chromeBinary)) {
    throw new Error("--chrome-binary must be an absolute path.");
  }
}

function validateReferenceCommit(referenceCommit) {
  if (referenceCommit === null || !/^[0-9a-f]{40}$/.test(referenceCommit)) {
    throw new Error(
      "--reference-commit must be a full 40-character lowercase commit SHA.",
    );
  }
}

function normalizeRuntimeReferenceManifest(options) {
  const manifestPath = options.runtimeReferenceManifest;
  if (manifestPath !== null && !path.isAbsolute(manifestPath)) {
    throw new Error(
      "--runtime-reference-manifest must be an absolute manifest path.",
    );
  }
  if (manifestPath !== null && options.mode !== "baseline") {
    throw new Error(
      "--runtime-reference-manifest is available only for baseline capture.",
    );
  }
  return manifestPath === null ? null : path.resolve(manifestPath);
}

function optionalPositiveInteger(value, name) {
  return value === null ? null : requirePositiveInteger(value, name);
}

function captureDeviceScaleFactor(value) {
  return value === null
    ? 1
    : requirePositiveNumber(value, "--device-scale-factor");
}

function normalizeOptions(options) {
  validateCaptureMode(options.mode);
  validateChromeBinary(options.chromeBinary);
  validateReferenceCommit(options.referenceCommit);
  return {
    chromeBinary: options.chromeBinary,
    deviceScaleFactor: captureDeviceScaleFactor(options.deviceScaleFactor),
    height: optionalPositiveInteger(options.height, "--height"),
    mode: options.mode,
    outputDir: normalizeOutputDirectory(options.outputDir),
    referenceCommit: resolveCommit(options.referenceCommit),
    runtimeReferenceManifest: normalizeRuntimeReferenceManifest(options),
    scenarioIds: options.scenarioIds,
    url: normalizeCaptureUrl(options.url),
    width: optionalPositiveInteger(options.width, "--width"),
  };
}

function captureUrl(baseUrl, theme) {
  const url = new URL(baseUrl);
  url.searchParams.set("setta-xyflow-parity-theme", theme);
  return url.href;
}

function viewportForScenario(scenario, options) {
  return {
    deviceScaleFactor: options.deviceScaleFactor,
    height: options.height ?? scenario.viewport.height,
    mobile: false,
    width: options.width ?? scenario.viewport.width,
  };
}

async function waitForReady(client) {
  const deadline = Date.now() + READY_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const ready = await evaluate(
      client,
      `document.readyState === "complete" &&
        document.querySelector('[data-workspace-shell="true"]') !== null &&
        document.querySelector('.react-flow') !== null &&
        document.querySelector('[data-testid="rf__minimap"]') !== null`,
    );
    if (ready === true) {
      await evaluate(
        client,
        `Promise.resolve(document.fonts?.ready).then(() =>
          new Promise((resolve) => requestAnimationFrame(() =>
            requestAnimationFrame(() => resolve(true)),
          )),
        )`,
      );
      await delay(SETTLE_DELAY_MS);
      return;
    }
    await delay(50);
  }
  throw new Error("The Playground did not reach an inspectable state.");
}

function isTransientChromeStartError(error) {
  return (
    error instanceof Error &&
    error.message.startsWith("Headless Chrome wrote an invalid DevTools port:")
  );
}

async function startReadyHeadlessChrome(chromeBinary) {
  let lastError = null;
  for (let attempt = 1; attempt <= CHROME_START_ATTEMPTS; attempt += 1) {
    const browser = startHeadlessChrome(chromeBinary);
    try {
      return { browser, port: await waitForHeadlessChrome(browser) };
    } catch (error) {
      await stopHeadlessChrome(browser);
      if (!isTransientChromeStartError(error)) {
        throw error;
      }
      lastError = error;
      await delay(50);
    }
  }
  throw lastError;
}

function pageIssueCollector(client) {
  const issues = [];
  const unsubscribers = [
    client.on("Runtime.exceptionThrown", ({ exceptionDetails }) => {
      issues.push(
        `exception: ${exceptionDetails?.exception?.description ?? exceptionDetails?.text ?? "Unidentified runtime exception"}`,
      );
    }),
    client.on("Runtime.consoleAPICalled", ({ args, type }) => {
      if (type === "error" || type === "assert") {
        issues.push(
          `console ${type}: ${(args ?? []).map((argument) => argument.value ?? argument.description ?? "").join(" ")}`,
        );
      }
    }),
    client.on("Log.entryAdded", ({ entry }) => {
      if (entry?.level === "error") {
        issues.push(
          `log error: ${entry.url ?? "unknown URL"}: ${entry.text ?? "Unidentified browser log error"}`,
        );
      }
    }),
  ];
  return {
    assertNone(context) {
      if (issues.length > 0) {
        throw new Error(
          `${context} emitted browser issues:\n${issues.join("\n")}`,
        );
      }
    },
    clear() {
      issues.length = 0;
    },
    dispose() {
      for (const unsubscribe of unsubscribers) {
        unsubscribe();
      }
    },
  };
}

async function addThemeInitializer(client) {
  await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: `(() => {
      const theme = new URLSearchParams(location.search).get('setta-xyflow-parity-theme');
      const applyTheme = () => {
        if (!document.documentElement) return false;
        document.documentElement.classList.toggle('dark', theme === 'dark');
        return true;
      };
      if (!applyTheme()) {
        const observer = new MutationObserver(() => {
          if (applyTheme()) observer.disconnect();
        });
        observer.observe(document, { childList: true });
      }
    })();`,
  });
}

async function assertSelectorsPresent(client, selectors, context) {
  const missing = await evaluate(
    client,
    `(() => {
      const selectors = ${JSON.stringify(selectors)};
      return selectors.filter((selector) => document.querySelector(selector) === null);
    })()`,
  );
  if (missing.length > 0) {
    throw new Error(`${context} is missing: ${missing.join(", ")}.`);
  }
}

async function assertSelectorsAbsent(client, selectors, context) {
  const present = await evaluate(
    client,
    `(() => {
      const selectors = ${JSON.stringify(selectors)};
      return selectors.filter((selector) => document.querySelector(selector) !== null);
    })()`,
  );
  if (present.length > 0) {
    throw new Error(`${context} unexpectedly contains: ${present.join(", ")}.`);
  }
}

async function assertSelectorsVisible(client, selectors, context) {
  const hidden = await evaluate(
    client,
    `(() => {
      const selectors = ${JSON.stringify(selectors)};
      return selectors.filter((selector) => ![...document.querySelectorAll(selector)].some((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
      }));
    })()`,
  );
  if (hidden.length > 0) {
    throw new Error(
      `${context} has no visible match for: ${hidden.join(", ")}.`,
    );
  }
}

async function assertSelectorsInvisible(client, selectors, context) {
  const visible = await evaluate(
    client,
    `(() => {
      const selectors = ${JSON.stringify(selectors)};
      return selectors.filter((selector) => [...document.querySelectorAll(selector)].some((element) => {
        const style = getComputedStyle(element);
        const rect = element.getBoundingClientRect();
        return style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity) > 0 && rect.width > 0 && rect.height > 0;
      }));
    })()`,
  );
  if (visible.length > 0) {
    throw new Error(
      `${context} has a visible match for: ${visible.join(", ")}.`,
    );
  }
}

async function normalizeDocumentChangeReadout(client) {
  return evaluate(
    client,
    `(() => {
      const readout = document.querySelector('.playground-change-status');
      const count = readout?.querySelector('.playground-change-status-count');
      if (!readout || !count) throw new Error('Playground document change readout is missing.');
      count.textContent = '0';
      readout.setAttribute('aria-label', '0 document changes reported');
      return 'normalized-to-zero';
    })()`,
  );
}

function pngDimensions(base64Data) {
  const image = Buffer.from(base64Data, "base64");
  if (image.subarray(0, 8).toString("hex") !== PNG_SIGNATURE) {
    throw new Error("Chrome did not return a PNG screenshot.");
  }
  if (image.length < 24) {
    throw new Error("Chrome returned a truncated PNG screenshot.");
  }
  return {
    height: image.readUInt32BE(20),
    width: image.readUInt32BE(16),
  };
}

function writeJson(filePath, value) {
  writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

async function executeActions(client, actions, phase, state) {
  for (const action of actions) {
    state.interactions.push({
      ...(await executeAction(
        client,
        action,
        state.heldPointer,
        state.heldKey,
      )),
      phase,
    });
  }
}

async function executeScenarioInteractions(client, scenario, state) {
  if (scenario.fixtureSetup !== false) {
    await executeActions(
      client,
      PLAYGROUND_PARITY_SETUP_ACTIONS,
      "fixture-setup",
      state,
    );
  }
  await executeActions(client, scenario.actions, "scenario", state);
}

async function assertScenarioSelectors(client, scenario) {
  await assertSelectorsPresent(client, scenario.requiredSelectors, scenario.id);
  await assertSelectorsAbsent(
    client,
    scenario.absentSelectors ?? [],
    scenario.id,
  );
  await assertSelectorsVisible(
    client,
    scenario.visibleSelectors ?? [],
    scenario.id,
  );
  await assertSelectorsInvisible(
    client,
    scenario.invisibleSelectors ?? [],
    scenario.id,
  );
}

function expectedScreenshotDimensions(viewport) {
  return {
    height: Math.round(viewport.height * viewport.deviceScaleFactor),
    width: Math.round(viewport.width * viewport.deviceScaleFactor),
  };
}

function assertScreenshotDimensions(dimensions, expected, scenarioId) {
  if (
    dimensions.height !== expected.height ||
    dimensions.width !== expected.width
  ) {
    throw new Error(
      `Scenario ${scenarioId} screenshot dimensions ${JSON.stringify(dimensions)} do not match ${JSON.stringify(expected)}.`,
    );
  }
}

async function captureScreenshot(client, scenario, viewport) {
  const screenshot = await client.send("Page.captureScreenshot", {
    captureBeyondViewport: false,
    format: "png",
    fromSurface: true,
  });
  if (typeof screenshot.data !== "string") {
    throw new Error(`Chrome returned no screenshot data for ${scenario.id}.`);
  }
  const dimensions = pngDimensions(screenshot.data);
  assertScreenshotDimensions(
    dimensions,
    expectedScreenshotDimensions(viewport),
    scenario.id,
  );
  return { data: screenshot.data, dimensions };
}

function createScenarioReceipt({
  context,
  documentChangeReadout,
  geometry,
  interactions,
  options,
  scenario,
  screenshotDimensions,
  viewport,
}) {
  return {
    capture: {
      baselineSourceGuard: context.baselineSourceGuard,
      builtWorkspace: context.builtWorkspace,
      chrome: context.chrome,
      captureCommit: context.captureCommit,
      frozenReferenceCommit: context.frozenReferenceCommit,
      liveResponses: context.liveResponses,
      mode: options.mode,
      recordedAt: new Date().toISOString(),
      runtimeReference: context.runtimeReference,
      sourceUrl: options.url,
      stabilization: {
        documentChangeReadout,
        fontReadiness: "document.fonts.ready",
        postActionDelayMs: SETTLE_DELAY_MS,
        settledFrames: 2,
      },
    },
    geometry,
    interactions,
    scenario: {
      catalogVersion: SCENARIO_CATALOG_VERSION,
      coverage: scenario.coverage,
      absentSelectors: scenario.absentSelectors ?? [],
      invisibleSelectors: scenario.invisibleSelectors ?? [],
      visibleSelectors: scenario.visibleSelectors ?? [],
      fixtureId: scenario.fixtureId,
      id: scenario.id,
      theme: scenario.theme,
      viewportId: scenario.viewportId,
    },
    screenshot: {
      dimensions: screenshotDimensions,
      file: `${scenario.id}/screenshot.png`,
    },
    viewport,
  };
}

async function captureScenario({
  client,
  context,
  issues,
  options,
  scenario,
  stagingDirectory,
}) {
  const viewport = viewportForScenario(scenario, options);
  await client.send("Emulation.setDeviceMetricsOverride", viewport);
  issues.clear();
  const url = captureUrl(options.url, scenario.theme);
  const loaded = client.waitForEvent("Page.loadEventFired", READY_TIMEOUT_MS);
  await client.send("Page.navigate", { url });
  await loaded;
  await waitForReady(client);
  const state = {
    heldKey: { value: null },
    heldPointer: { value: null },
    interactions: [],
  };
  try {
    await executeScenarioInteractions(client, scenario, state);
    const documentChangeReadout = await normalizeDocumentChangeReadout(client);
    await assertScenarioSelectors(client, scenario);
    issues.assertNone(`${scenario.id} before screenshot`);
    const geometry = await captureGeometry(client, scenario);
    const screenshot = await captureScreenshot(client, scenario, viewport);
    const scenarioDirectory = path.join(stagingDirectory, scenario.id);
    writeFileSync(
      path.join(scenarioDirectory, "screenshot.png"),
      screenshot.data,
      "base64",
    );
    const receipt = createScenarioReceipt({
      context,
      documentChangeReadout,
      geometry,
      interactions: state.interactions,
      options,
      scenario,
      screenshotDimensions: screenshot.dimensions,
      viewport,
    });
    writeJson(path.join(scenarioDirectory, "receipt.json"), receipt);
    return receipt;
  } finally {
    await releaseHeldPointer(client, state.heldPointer);
    await releaseHeldKey(client, state.heldKey);
  }
}

function printCatalog(catalog) {
  console.log(
    JSON.stringify(
      {
        catalogVersion: SCENARIO_CATALOG_VERSION,
        coverage: catalog.coverage,
        scenarioCount: catalog.scenarioCount,
        coverageLedger: catalog.coverageLedger,
        unsupportedStates: catalog.unsupportedStates,
      },
      null,
      2,
    ),
  );
}

function runtimeReferenceFor(options) {
  return options.runtimeReferenceManifest === null
    ? null
    : readRuntimeReferenceManifest(
        options.runtimeReferenceManifest,
        options.referenceCommit,
      );
}

function baselineSourceGuardFor(options, runtimeReference) {
  return options.mode === "baseline" && runtimeReference === null
    ? assertBaselineProductSource(options.referenceCommit)
    : null;
}

async function prepareCapture(options) {
  assertEmptyOutputDirectory(options.outputDir);
  const runtimeReference = runtimeReferenceFor(options);
  const baselineSourceGuard = baselineSourceGuardFor(options, runtimeReference);
  const builtWorkspace = workspaceDistArtifactHashes();
  const liveResponses = await livePlaygroundResponseHashes(options.url);
  if (runtimeReference !== null) {
    assertRuntimeReferenceArtifact(
      runtimeReference,
      builtWorkspace,
      liveResponses,
    );
  }
  return {
    baselineSourceGuard,
    builtWorkspace,
    liveResponses,
    runtimeReference,
  };
}

function chromeIdentity(browser, options, version) {
  return {
    binary: browser.child.spawnfile ?? options.chromeBinary ?? "default",
    jsVersion: version.jsVersion,
    product: version.product,
    revision: version.revision,
    userAgent: version.userAgent,
  };
}

function captureContext(options, prepared, chrome) {
  return {
    baselineSourceGuard: prepared.baselineSourceGuard,
    chrome,
    builtWorkspace: prepared.builtWorkspace,
    captureCommit: currentCommit(),
    frozenReferenceCommit: options.referenceCommit,
    liveResponses: prepared.liveResponses,
    runtimeReference:
      prepared.runtimeReference === null
        ? null
        : runtimeReferenceReceipt(
            prepared.runtimeReference,
            options.referenceCommit,
            chrome,
          ),
  };
}

async function captureScenarios(client, issues, options, scenarios, state) {
  const receipts = [];
  for (const scenario of scenarios) {
    const scenarioDirectory = path.join(state.stagingDirectory, scenario.id);
    if (existsSync(scenarioDirectory)) {
      throw new Error(`Scenario output already exists: ${scenarioDirectory}.`);
    }
    mkdirSync(scenarioDirectory);
    receipts.push(
      await captureScenario({
        client,
        context: state.context,
        issues,
        options,
        scenario,
        stagingDirectory: state.stagingDirectory,
      }),
    );
  }
  return receipts;
}

async function assertCaptureInputsUnchanged(options, prepared) {
  if (
    !sameArtifactHashes(prepared.builtWorkspace, workspaceDistArtifactHashes())
  ) {
    throw new Error("The built workspace artifact changed during capture.");
  }
  if (
    JSON.stringify(prepared.liveResponses) !==
    JSON.stringify(await livePlaygroundResponseHashes(options.url))
  ) {
    throw new Error("Live Playground responses changed during capture.");
  }
  if (prepared.runtimeReference !== null) {
    assertRuntimeReferenceArtifact(
      prepared.runtimeReference,
      workspaceDistArtifactHashes(),
      await livePlaygroundResponseHashes(options.url),
    );
  }
}

function captureManifest(options, scenarios, receipts, context) {
  return {
    capture: {
      ...context,
      mode: options.mode,
      recordedAt: new Date().toISOString(),
      sourceUrl: options.url,
      stabilization: {
        fontReadiness: "document.fonts.ready",
        postActionDelayMs: SETTLE_DELAY_MS,
        settledFrames: 2,
      },
    },
    catalog: {
      catalogVersion: SCENARIO_CATALOG_VERSION,
      completeCatalog: scenarios.length === PLAYGROUND_PARITY_SCENARIOS.length,
      requiredCoverage: REQUIRED_SCENARIO_COVERAGE,
      selectedScenarioIds: scenarios.map((scenario) => scenario.id),
      coverageLedger: PLAYGROUND_PARITY_COVERAGE_LEDGER,
      unsupportedStates: PLAYGROUND_PARITY_UNSUPPORTED_STATES,
    },
    schemaVersion: CAPTURE_SCHEMA_VERSION,
    scenarios: receipts.map((receipt) => ({
      id: receipt.scenario.id,
      receipt: `${receipt.scenario.id}/receipt.json`,
      screenshot: receipt.screenshot.file,
      theme: receipt.scenario.theme,
      viewport: receipt.viewport,
    })),
  };
}

function printCaptureSummary(options, scenarios) {
  console.log(
    JSON.stringify(
      {
        mode: options.mode,
        outputDir: options.outputDir,
        referenceCommit: options.referenceCommit,
        scenarioCount: scenarios.length,
        scenarioIds: scenarios.map((scenario) => scenario.id),
      },
      null,
      2,
    ),
  );
}

async function capturePage(page, browser, state) {
  const client = page.client;
  await Promise.all([
    client.send("Log.enable"),
    client.send("Page.enable"),
    client.send("Runtime.enable"),
  ]);
  await addThemeInitializer(client);
  const issues = pageIssueCollector(client);
  try {
    const version = await client.send("Browser.getVersion");
    const context = captureContext(
      state.options,
      state.prepared,
      chromeIdentity(browser, state.options, version),
    );
    const receipts = await captureScenarios(
      client,
      issues,
      state.options,
      state.scenarios,
      { context, stagingDirectory: state.stagingDirectory },
    );
    await assertCaptureInputsUnchanged(state.options, state.prepared);
    writeJson(
      path.join(state.stagingDirectory, "manifest.json"),
      captureManifest(state.options, state.scenarios, receipts, context),
    );
    promoteStagingDirectory(state.stagingDirectory, state.options.outputDir);
    printCaptureSummary(state.options, state.scenarios);
  } finally {
    issues.dispose();
  }
}

async function captureWithChrome(
  options,
  scenarios,
  prepared,
  stagingDirectory,
) {
  const { browser, port } = await startReadyHeadlessChrome(
    options.chromeBinary,
  );
  try {
    const page = await createCdpPage(port);
    try {
      await capturePage(page, browser, {
        options,
        prepared,
        scenarios,
        stagingDirectory,
      });
    } finally {
      page.client.close();
    }
  } finally {
    await stopHeadlessChrome(browser);
  }
}

async function runCapture(options, scenarios) {
  const prepared = await prepareCapture(options);
  const stagingDirectory = createStagingDirectory(options.outputDir);
  try {
    await captureWithChrome(options, scenarios, prepared, stagingDirectory);
  } finally {
    if (existsSync(stagingDirectory)) {
      rmSync(stagingDirectory, { force: true, recursive: true });
    }
  }
}

async function main() {
  const parsed = parseArguments(process.argv.slice(2));
  if (parsed.help) {
    console.log(usage());
    return;
  }
  const catalog = validateScenarioCatalog();
  if (parsed.validateCatalog) {
    printCatalog(catalog);
    return;
  }
  const options = normalizeOptions(parsed);
  await runCapture(options, selectParityScenarios(options.scenarioIds));
}

await main();
