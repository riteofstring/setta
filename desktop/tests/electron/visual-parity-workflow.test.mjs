/* global console */

import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import { driverCallExpression } from "./cdp-client.mjs";
import {
  assertBuildExists,
  captureScreenshot,
  captureScreenshotClip,
  createElectronFixture,
  launchElectronCdpContext,
  repoRoot,
  reloadPage,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import {
  maximizeWorkflowGraphPane,
  openWorkflowGraphPane,
} from "./workflow-graph-layout-helpers.mjs";
import {
  assertWorkflowProjectionSnapshot,
  createWorkflowProjectionFixture,
  isWorkflowProjectionSnapshotReady,
} from "./workflow-projection-smoke-helpers.mjs";
import { agentJudgeVerdict } from "./visual-parity-agent-judge.mjs";
import {
  boxBlurImage,
  copyPng,
  darkenImage,
  deriveVisualParityTarget,
  imageMetricsForPng,
  readPng,
  scoreVisualParityMetrics,
  sideBySideImage,
  writePng,
} from "./visual-parity-image.mjs";

const visualReportRoot = join(repoRoot, "docs", "reports", "visual");
const workflowIdleKnownBadPath = join(
  visualReportRoot,
  "controls",
  "workflow-idle-known-bad-phase6.png",
);
const defaultScenes = ["workflow-idle", "workflow-running", "semantic-cells", "merged"];
const defaultAgentJudgeRunner = process.env.SETTA_VISUAL_PARITY_AGENT_JUDGE_RUNNER || "codex-cli";
const defaultAgentJudgeTimeoutMs = 360_000;
const defaultAgentJudgeTrials = 3;
const defaultMockupRenderCount = 5;
const appFitPaddingScreenPx = 160;
const appMaxFitZoom = 1.15;
const visualParityArgHandlers = {
  "--agent-judge-file": parseStringOption("agentJudgeFile"),
  "--agent-judge-model": parseStringOption("agentJudgeModel"),
  "--agent-judge-runner": parseStringOption("agentJudgeRunner"),
  "--agent-judge-timeout-ms": parseIntegerOption("agentJudgeTimeoutMs"),
  "--agent-judge-trials": parseIntegerOption("agentJudgeTrials"),
  "--artifact-dir": parseStringOption("artifactDir"),
  "--freeze-known-bad": parseBooleanOption("freezeKnownBad"),
  "--help": parseBooleanOption("help"),
  "--keep-artifacts": parseBooleanOption("keepArtifacts"),
  "--keep-going": parseBooleanOption("keepGoing"),
  "--mockup-renders": (parsed, args, index, flag) => {
    parsed.mockupRenderCount = Number.parseInt(requiredArgValue(args, index, flag), 10);
    return index + 1;
  },
  "--scene": (parsed, args, index, flag) => {
    parsed.scenes.push(requiredArgValue(args, index, flag));
    return index + 1;
  },
  "--skip-build": parseBooleanOption("skipBuild"),
  "--visible": parseBooleanOption("visible"),
  "-h": parseBooleanOption("help"),
};
const syntheticSceneReadyChecks = {
  merged: (snapshot) =>
    snapshot.graph.nodes.some((node) => node.layer === "workflow") &&
    snapshot.graph.nodes.some((node) => node.layer === "semantic") &&
    snapshot.graph.edges.some((edge) => edge.layer === "workflow") &&
    snapshot.graph.edges.some((edge) => edge.layer === "semantic"),
  "semantic-cells": (snapshot) =>
    snapshot.graph.nodes.length === 6 &&
    snapshot.graph.nodes.every((node) => node.layer === "semantic") &&
    snapshot.graph.edges.length >= 6,
  "workflow-running": (snapshot) =>
    snapshot.graph.nodes.length === 3 &&
    snapshot.graph.nodes.some((node) => node.status === "running") &&
    snapshot.graph.edges.some((edge) => edge.status === "active"),
};

const options = parseVisualParityArgs(process.argv.slice(2));

if (options.help) {
  printUsage();
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactDir = options.artifactDir || timestampedRecordingDir("visual-parity");
await writeLatestRecordingPointer("visual-parity", artifactDir);
const results = [];
let failed = false;

for (const scene of options.scenes) {
  const result = await runScene(scene);
  results.push(result);
  if (!result.pass) {
    failed = true;
    if (!options.keepGoing) {
      break;
    }
  }
}

await writeJson(join(artifactDir, "summary.json"), {
  artifactDir,
  results,
  status: failed ? "failed" : "passed",
});

if (failed) {
  process.exitCode = 1;
}

async function runScene(scene) {
  const sceneDir = join(visualReportRoot, scene);
  await mkdir(sceneDir, { recursive: true });
  await writeFile(join(sceneDir, "command.txt"), commandLine(), "utf8");

  const appRender = await renderAppScene(scene, {
    artifactDir: join(artifactDir, scene, "app"),
    outputDir: sceneDir,
  });
  const mockupRender = await renderMockupScene(scene, {
    cssHeight: appRender.cssHeight,
    cssWidth: appRender.cssWidth,
    artifactDir: join(artifactDir, scene, "mockup"),
    deviceScaleFactor: appRender.deviceScaleFactor,
    outputDir: sceneDir,
    renderCount: options.mockupRenderCount,
  });
  const controls = await prepareControls(scene, {
    appPath: appRender.appPath,
    mockupPath: mockupRender.mockupPath,
    sceneDir,
  });
  const target = deriveVisualParityTarget({
    mockupMetrics: mockupRender.metrics,
    negativeControlMetrics: controls.negativeControlMetrics,
  });
  await writeJson(join(visualReportRoot, `${scene}.target.json`), target);

  const appMetrics = await imageMetricsForPng(appRender.appPath);
  const scorecard = scoreVisualParityMetrics({ actualMetrics: appMetrics, target });
  const controlScorecard = scoreControls({
    controls,
    mockupMetrics: mockupRender.metrics[0],
    target,
  });
  const agentJudge = await agentJudgeVerdict({
    appMetrics,
    appPath: appRender.appPath,
    artifactDir,
    controlScorecard,
    mockupPath: mockupRender.mockupPath,
    options,
    repoRoot,
    scene,
    scorecard,
    target,
  });
  const mockupImage = await readPng(mockupRender.mockupPath);
  const appImage = await readPng(appRender.appPath);
  await writePng(join(sceneDir, "side-by-side.png"), sideBySideImage(mockupImage, appImage));
  await writeJson(join(sceneDir, "metrics.json"), {
    appMetrics,
    appRender,
    controlScorecard,
    mockupMetrics: mockupRender.metrics,
    pass: scorecard.pass && controlScorecard.pass && agentJudge.pass,
    scorecard,
    targetPath: join(visualReportRoot, `${scene}.target.json`),
  });
  await writeJson(join(sceneDir, "agent-judge.json"), agentJudge);

  return {
    agentJudge,
    appPath: appRender.appPath,
    controlScorecard,
    metricsPath: join(sceneDir, "metrics.json"),
    mockupPath: mockupRender.mockupPath,
    pass: scorecard.pass && controlScorecard.pass && agentJudge.pass,
    scene,
    scorecard,
  };
}

async function renderAppScene(scene, { artifactDir: appArtifactDir, outputDir }) {
  switch (scene) {
    case "workflow-idle":
      return renderWorkflowIdleAppScene({ artifactDir: appArtifactDir, outputDir, scene });
    case "workflow-running":
    case "semantic-cells":
    case "merged":
      return renderSyntheticAppScene({ artifactDir: appArtifactDir, outputDir, scene });
    default:
      throw new Error(`visual parity app scene is not implemented yet: ${scene}`);
  }
}

async function renderWorkflowIdleAppScene({ artifactDir: appArtifactDir, outputDir, scene }) {
  const fixture = await createElectronFixture(`visual-parity-${scene}`);
  let context = null;
  try {
    context = await launchElectronCdpContext({
      artifactDir: appArtifactDir,
      extraEnv: {
        SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
        SETTA_WORKFLOW_GRAPH_DEBUG: "1",
      },
      fixture,
      visible: options.visible,
    });
    const workflowProjection = await createWorkflowProjectionFixture(
      context.client,
      fixture.workspaceRoot,
    );
    await reloadPage(context.client);
    await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
    await openWorkflowGraphPane(context.client);
    await waitForSelector(context.client, '[data-testid="workflow-graph"]');
    const surfaceId = await maximizeWorkflowGraphPane(context.client);
    const initial = await waitForWorkflowGraphSnapshot(context.client, surfaceId, (snapshot) =>
      isWorkflowProjectionSnapshotReady(snapshot, workflowProjection),
    );
    assertWorkflowProjectionSnapshot(initial, workflowProjection);
    const fitCamera = await context.client.driver("workflowGraphFitToView", {
      maxFitZoom: appMaxFitZoom,
      paddingScreenPx: appFitPaddingScreenPx,
      surfaceId,
    });
    await delay(150);
    const fitSnapshot = await getWorkflowGraphSnapshot(context.client, surfaceId);
    await context.client.driver("hideWorkflowGraphCaptureChrome", { surfaceId });
    await delay(50);
    const clip = await workflowGraphCanvasClip(context.client, surfaceId);
    const fitPath = join(outputDir, `${scene}-fit.png`);
    const appPath = join(outputDir, "app.png");
    await captureScreenshotClip(context.client, fitPath, clip);
    await copyPng(fitPath, appPath);
    const appImage = await readPng(appPath);
    await writeCompactJson(join(outputDir, "app-snapshot.json"), {
      fitCamera,
      fitSnapshot,
      initial,
      surfaceId,
      workflowProjection,
    });
    return {
      appPath,
      camera: fitCamera,
      cssHeight: Math.round(clip.height),
      cssWidth: Math.round(clip.width),
      deviceScaleFactor: appImage.width / Math.max(1, Math.round(clip.width)),
      fitPath,
      height: appImage.height,
      width: appImage.width,
    };
  } catch (error) {
    if (context) {
      await captureScreenshot(context.client, join(appArtifactDir, "failure.png")).catch(() => {});
    }
    throw error;
  } finally {
    await stopElectronCdpContext(context);
  }
}

async function renderSyntheticAppScene({ artifactDir: appArtifactDir, outputDir, scene }) {
  const fixture = await createElectronFixture(`visual-parity-${scene}`);
  let context = null;
  try {
    context = await launchElectronCdpContext({
      artifactDir: appArtifactDir,
      extraEnv: {
        SETTA_E2E_CHAT_HARNESS: "scripted-workflow",
        SETTA_WORKFLOW_GRAPH_DEBUG: "1",
        SETTA_WORKFLOW_GRAPH_SYNTHETIC_EDGES_PER_NODE: "1",
        SETTA_WORKFLOW_GRAPH_SYNTHETIC_NODE_COUNT: scene === "workflow-running" ? "3" : "6",
        SETTA_WORKFLOW_GRAPH_SYNTHETIC_SCENE: scene,
      },
      fixture,
      visible: options.visible,
    });
    await waitForSelector(context.client, '[data-testid="workspace-layout-area"]');
    const workspace = await context.client.driver("openWorkspacePath", {
      workspaceRoot: fixture.workspaceRoot,
    });
    await waitForState(
      context.client,
      driverCallExpression("workflowWorkspaceSessionState"),
      (value) => value.selectedWorkspaceId === workspace.workspaceId,
    );
    await openWorkflowGraphPane(context.client);
    await waitForSelector(context.client, '[data-testid="workflow-graph"]');
    const surfaceId = await maximizeWorkflowGraphPane(context.client);
    const initial = await waitForWorkflowGraphSnapshot(context.client, surfaceId, (snapshot) =>
      syntheticSceneReady(scene, snapshot),
    );
    const fitCamera = await context.client.driver("workflowGraphFitToView", {
      maxFitZoom: appMaxFitZoom,
      paddingScreenPx: appFitPaddingScreenPx,
      surfaceId,
    });
    await delay(150);
    const fitSnapshot = await getWorkflowGraphSnapshot(context.client, surfaceId);
    await context.client.driver("hideWorkflowGraphCaptureChrome", { surfaceId });
    await delay(50);
    const clip = await workflowGraphCanvasClip(context.client, surfaceId);
    const fitPath = join(outputDir, `${scene}-fit.png`);
    const appPath = join(outputDir, "app.png");
    await captureScreenshotClip(context.client, fitPath, clip);
    await copyPng(fitPath, appPath);
    const appImage = await readPng(appPath);
    await writeCompactJson(join(outputDir, "app-snapshot.json"), {
      fitCamera,
      fitSnapshot,
      initial,
      surfaceId,
    });
    return {
      appPath,
      camera: fitCamera,
      cssHeight: Math.round(clip.height),
      cssWidth: Math.round(clip.width),
      deviceScaleFactor: appImage.width / Math.max(1, Math.round(clip.width)),
      fitPath,
      height: appImage.height,
      width: appImage.width,
    };
  } catch (error) {
    if (context) {
      await captureScreenshot(context.client, join(appArtifactDir, "failure.png")).catch(() => {});
    }
    throw error;
  } finally {
    await stopElectronCdpContext(context);
  }
}

async function renderMockupScene(
  scene,
  {
    artifactDir: mockupArtifactDir,
    cssHeight,
    cssWidth,
    deviceScaleFactor,
    outputDir,
    renderCount,
  },
) {
  const mockupPaths = [];
  const metrics = [];
  for (let index = 0; index < renderCount; index += 1) {
    const mockupPath =
      index === 0 ? join(outputDir, "mockup.png") : join(outputDir, `mockup-rerender-${index}.png`);
    await renderSingleMockupScene(scene, {
      artifactDir: join(mockupArtifactDir, `render-${index}`),
      cssHeight,
      cssWidth,
      deviceScaleFactor,
      outputPath: mockupPath,
      renderIndex: index,
    });
    mockupPaths.push(mockupPath);
    metrics.push(await imageMetricsForPng(mockupPath));
  }
  return {
    metrics,
    mockupPath: mockupPaths[0],
    mockupPaths,
  };
}

async function renderSingleMockupScene(
  scene,
  {
    artifactDir: mockupArtifactDir,
    cssHeight,
    cssWidth,
    deviceScaleFactor,
    outputPath,
    renderIndex,
  },
) {
  const fixture = await createElectronFixture(`visual-parity-mockup-${scene}-${renderIndex}`);
  let context = null;
  try {
    context = await launchElectronCdpContext({
      artifactDir: mockupArtifactDir,
      fixture,
      visible: false,
    });
    await context.client.call("Emulation.setDeviceMetricsOverride", {
      deviceScaleFactor,
      height: cssHeight,
      mobile: false,
      width: cssWidth,
    });
    await context.client.call("Page.navigate", { url: mockupUrlForScene(scene, renderIndex) });
    await waitForState(
      context.client,
      "({ ready: window.__settaVisualParityReady === true, href: location.href })",
      (value) => value.ready,
      10_000,
    );
    await captureScreenshotClip(context.client, outputPath, {
      height: cssHeight,
      width: cssWidth,
      x: 0,
      y: 0,
    });
  } finally {
    await stopElectronCdpContext(context);
  }
}

async function prepareControls(scene, { appPath, mockupPath, sceneDir }) {
  if (scene === "workflow-idle" && !existsSync(workflowIdleKnownBadPath)) {
    if (!options.freezeKnownBad) {
      throw new Error(
        `missing frozen known-bad control: ${workflowIdleKnownBadPath}. Run this workflow once with --freeze-known-bad before calibration.`,
      );
    }
    await copyPng(appPath, workflowIdleKnownBadPath);
    await writeJson(join(visualReportRoot, "controls", "workflow-idle-known-bad-phase6.json"), {
      command: commandLine(),
      source: appPath,
      sourceCommit: "1992781fb-compatible",
      writtenAt: new Date().toISOString(),
    });
  }

  const mockup = await readPng(mockupPath);
  const darkenedPath = join(sceneDir, "control-darkened.png");
  const blurredPath = join(sceneDir, "control-blurred.png");
  await writePng(darkenedPath, darkenImage(mockup, 0.58));
  await writePng(blurredPath, boxBlurImage(mockup, 3));

  const negativeControlPaths = {
    blurred: blurredPath,
    darkened: darkenedPath,
    ...(scene === "workflow-idle" ? { knownBadPhase6: workflowIdleKnownBadPath } : {}),
  };
  const negativeControlMetrics = {};
  for (const [name, path] of Object.entries(negativeControlPaths)) {
    negativeControlMetrics[name] = await imageMetricsForPng(path);
  }
  await writeJson(join(sceneDir, "controls.json"), {
    negativeControlPaths,
    negativeControlMetrics,
  });
  return {
    negativeControlMetrics,
    negativeControlPaths,
  };
}

function scoreControls({ controls, mockupMetrics, target }) {
  const mockupScore = scoreVisualParityMetrics({ actualMetrics: mockupMetrics, target });
  const negativeScores = Object.fromEntries(
    Object.entries(controls.negativeControlMetrics).map(([name, metrics]) => [
      name,
      scoreVisualParityMetrics({ actualMetrics: metrics, target }),
    ]),
  );
  return {
    mockupVsMockup: {
      expected: "pass",
      pass: mockupScore.pass,
      score: mockupScore,
    },
    negativeControls: Object.fromEntries(
      Object.entries(negativeScores).map(([name, score]) => [
        name,
        {
          expected: "fail",
          pass: !score.pass,
          score,
        },
      ]),
    ),
    pass: mockupScore.pass && Object.values(negativeScores).every((score) => score.pass === false),
  };
}

async function waitForWorkflowGraphSnapshot(client, surfaceId, predicate) {
  await client.installDriver();
  return waitForState(
    client,
    driverCallExpression("workflowGraphDebugSnapshotReady", { surfaceId }),
    (value) => value.ready && predicate(value.snapshot),
  ).then((value) => value.snapshot);
}

async function getWorkflowGraphSnapshot(client, surfaceId) {
  return client.driver("workflowGraphDebugSnapshot", { surfaceId });
}

async function workflowGraphCanvasClip(client, surfaceId) {
  const rect = await client.driver("workflowGraphCanvasRect", { surfaceId });
  const inset = 1;
  return {
    height: Math.max(1, Math.round(rect.height - inset * 2)),
    width: Math.max(1, Math.round(rect.width - inset * 2)),
    x: Math.max(0, Math.round(rect.left + inset)),
    y: Math.max(0, Math.round(rect.top + inset)),
  };
}

function mockupUrlForScene(scene, renderIndex) {
  switch (scene) {
    case "workflow-idle":
    case "workflow-running": {
      const url = pathToFileURL(
        join(repoRoot, "docs", "mockups", "workflow-graph-aesthetics.html"),
      );
      url.searchParams.set("capture", "1");
      url.searchParams.set("scene", scene);
      url.searchParams.set("now", String(1800 + renderIndex * 17));
      url.hash = "neon";
      return url.href;
    }
    case "semantic-cells":
    case "merged": {
      const url = pathToFileURL(join(repoRoot, "docs", "mockups", "living-workspace.html"));
      url.searchParams.set("capture", "1");
      url.searchParams.set("scene", scene);
      url.searchParams.set("now", String(2200 + renderIndex * 17));
      return url.href;
    }
    default:
      throw new Error(`visual parity mockup scene is not implemented yet: ${scene}`);
  }
}

function syntheticSceneReady(scene, snapshot) {
  if (!snapshot.visual.hasNonBackgroundPixels || snapshot.render.frameCount <= 2) {
    return false;
  }
  const check = syntheticSceneReadyChecks[scene];
  if (!check) {
    return false;
  }
  return check(snapshot);
}

function parseVisualParityArgs(args) {
  const parsed = {
    agentJudgeFile: "",
    agentJudgeModel: "",
    agentJudgeRunner: defaultAgentJudgeRunner,
    agentJudgeTimeoutMs: defaultAgentJudgeTimeoutMs,
    agentJudgeTrials: defaultAgentJudgeTrials,
    artifactDir: "",
    freezeKnownBad: false,
    help: false,
    keepGoing: false,
    keepArtifacts: false,
    mockupRenderCount: defaultMockupRenderCount,
    scenes: [],
    skipBuild: false,
    visible: false,
  };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    const handler = visualParityArgHandlers[arg];
    if (!handler) {
      throw new Error(`unknown visual parity argument: ${arg}`);
    }
    index = handler(parsed, args, index, arg);
  }
  if (!Number.isInteger(parsed.mockupRenderCount) || parsed.mockupRenderCount < 1) {
    throw new Error(
      `--mockup-renders must be a positive integer: ${String(parsed.mockupRenderCount)}`,
    );
  }
  if (!Number.isInteger(parsed.agentJudgeTrials) || parsed.agentJudgeTrials < 1) {
    throw new Error(
      `--agent-judge-trials must be a positive integer: ${String(parsed.agentJudgeTrials)}`,
    );
  }
  if (!Number.isInteger(parsed.agentJudgeTimeoutMs) || parsed.agentJudgeTimeoutMs < 1_000) {
    throw new Error(
      `--agent-judge-timeout-ms must be at least 1000: ${String(parsed.agentJudgeTimeoutMs)}`,
    );
  }
  if (!parsed.agentJudgeFile && parsed.agentJudgeTrials !== 3) {
    throw new Error("Phase 6.5 requires --agent-judge-trials 3 unless using --agent-judge-file");
  }
  if (!["codex-cli", "none"].includes(parsed.agentJudgeRunner)) {
    throw new Error(`--agent-judge-runner must be codex-cli or none: ${parsed.agentJudgeRunner}`);
  }
  if (parsed.scenes.length === 0) {
    parsed.scenes = [...defaultScenes];
  }
  return parsed;
}

function parseStringOption(field) {
  return (parsed, args, index, flag) => {
    parsed[field] = requiredArgValue(args, index, flag);
    return index + 1;
  };
}

function parseBooleanOption(field) {
  return (parsed, _args, index) => {
    parsed[field] = true;
    return index;
  };
}

function parseIntegerOption(field) {
  return (parsed, args, index, flag) => {
    parsed[field] = Number.parseInt(requiredArgValue(args, index, flag), 10);
    return index + 1;
  };
}

function requiredArgValue(args, index, flag) {
  const value = args[index + 1];
  if (!value) {
    throw new Error(`${flag} requires a value`);
  }
  return value;
}

function printUsage() {
  console.log(`Usage: node desktop/tests/electron/visual-parity-workflow.test.mjs [options]

Options:
  --scene <name>                  Run one visual parity scene; repeatable.
  --freeze-known-bad             One-time creation of the Phase 6 known-bad control if missing.
  --agent-judge-runner <name>    Vision judge runner: codex-cli or none.
  --agent-judge-model <model>    Optional Codex CLI model override for vision judge trials.
  --agent-judge-trials <count>   Agent judge trial count; Phase 6.5 default/required is 3.
  --agent-judge-file <path>      Structured JSON verdict from authorized image-capable agents.
  --mockup-renders <count>       Mockup rerenders used for tolerance derivation.
  --artifact-dir <dir>           Timestamped runtime artifacts directory.
  --skip-build                   Use the current desktop/out build.
  --visible                      Show Electron windows.
`);
}

function commandLine() {
  return `${process.argv.map((part) => JSON.stringify(part)).join(" ")}\n`;
}

async function writeCompactJson(path, value) {
  await writeFile(path, `${JSON.stringify(value)}\n`, "utf8");
}
