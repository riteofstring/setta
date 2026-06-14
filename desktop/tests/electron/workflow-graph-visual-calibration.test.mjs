/* global console */

import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

import { driverCallExpression } from "./cdp-client.mjs";
import {
  assertBuildExists,
  captureScreenshot,
  createElectronFixture,
  launchElectronCdpContext,
  parseElectronHarnessArgs,
  readJsonLinesOptional,
  reloadPage,
  repoRoot,
  stopElectronCdpContext,
  timestampedRecordingDir,
  waitForSelector,
  waitForState,
  writeJson,
  writeLatestRecordingPointer,
} from "./electron-cdp-harness.mjs";
import { createWorkflowProjectionFixture } from "./workflow-projection-smoke-helpers.mjs";
import {
  maximizeWorkflowGraphPane,
  openWorkflowGraphPane,
} from "./workflow-graph-layout-helpers.mjs";

const scenarioTimeoutMs = 45_000;
const fitPadding = 96;
const visualScenarioMatchers = {
  merged: mergedGraphMatches,
  "semantic-cells": semanticCellsGraphMatches,
  "workflow-idle": workflowIdleGraphMatches,
  "workflow-running": workflowRunningGraphMatches,
};

const scenarios = [
  {
    kind: "fixture",
    mockup: "workflow-graph-aesthetics.html#neon",
    name: "workflow-idle",
  },
  {
    kind: "synthetic",
    mockup: "workflow-graph-aesthetics.html#neon",
    name: "workflow-running",
    synthetic: { edgesPerNode: 1, nodeCount: 24, scene: "workflow" },
  },
  {
    kind: "synthetic",
    mockup: "living-workspace.html",
    name: "semantic-cells",
    synthetic: { edgesPerNode: 1, nodeCount: 18, scene: "semantic-cells" },
  },
  {
    kind: "synthetic",
    mockup: "living-workspace.html",
    name: "merged",
    synthetic: { edgesPerNode: 1, nodeCount: 24, scene: "merged" },
  },
];

const options = parseElectronHarnessArgs(process.argv.slice(2));

if (options.help) {
  console.log(
    `Usage: node desktop/tests/electron/workflow-graph-visual-calibration.test.mjs [--skip-build] [--visible] [--keep-artifacts] [--artifact-dir <dir>]`,
  );
  process.exit(0);
}

if (!options.skipBuild) {
  assertBuildExists();
}

const artifactRoot = options.artifactDir || timestampedRecordingDir("workflow-graph-visual");
await writeLatestRecordingPointer("workflow-graph-visual", artifactRoot);
const results = [];

try {
  for (const scenario of scenarios) {
    const result = await captureVisualScenario(scenario);
    results.push(result);
    await writeJson(join(artifactRoot, "summary.json"), {
      artifactRoot,
      results,
      status: "running",
    });
    console.log(`workflow graph visual calibration captured: ${scenario.name}`);
  }
  await writeReviewIndex(results);
  await writeJson(join(artifactRoot, "summary.json"), {
    artifactRoot,
    results,
    review: join(artifactRoot, "visual-calibration-review.html"),
    status: "rendered",
    visualParity: "pending-parity-gate",
  });
  console.log(
    `workflow graph visual calibration RENDERED — NOT a parity verdict. Parity is decided by the automated parity gate (run \`--workflow visual-parity\`), never by a human: ${artifactRoot}`,
  );
} catch (error) {
  await writeJson(join(artifactRoot, "summary.json"), {
    artifactRoot,
    error: error instanceof Error ? error.message : String(error),
    results,
    status: "failed",
  });
  throw error;
}

async function captureVisualScenario(scenario) {
  const artifactDir = join(artifactRoot, scenario.name);
  const fixture = await createElectronFixture(`workflow-graph-visual-${scenario.name}`);
  let context = null;
  let surfaceId = null;
  try {
    context = await launchElectronCdpContext({
      artifactDir,
      extraEnv: scenarioEnv(scenario),
      fixture,
      visible: options.visible,
    });
    if (scenario.kind === "fixture") {
      await createWorkflowProjectionFixture(context.client, fixture.workspaceRoot);
      await reloadPage(context.client);
    } else {
      await openFixtureWorkspace(context.client, fixture.workspaceRoot);
      await reloadPage(context.client);
    }
    await waitForSelector(
      context.client,
      '[data-testid="workspace-layout-area"]',
      scenarioTimeoutMs,
    );
    await openWorkflowGraphPane(context.client, { timeoutMs: scenarioTimeoutMs });
    await waitForSelector(context.client, '[data-testid="workflow-graph"]', scenarioTimeoutMs);
    surfaceId = await maximizeWorkflowGraphPane(context.client, { timeoutMs: scenarioTimeoutMs });
    const initial = await waitForWorkflowGraphSnapshot(
      context.client,
      surfaceId,
      (snapshot) => scenarioSnapshotReady(snapshot, scenario),
      scenarioTimeoutMs,
    );
    const fit = await context.client.driver("fitWorkflowGraphToView", {
      maxZoom: 1,
      padding: fitPadding,
      surfaceId,
    });
    if (!fit.ok) {
      throw new Error(`${scenario.name} fit-to-view failed: ${JSON.stringify(fit)}`);
    }
    await delay(150);
    const snapshot = await getWorkflowGraphSnapshot(context.client, surfaceId);
    assertVisualScenarioSnapshot(snapshot, scenario);
    assertNodesInsideCanvas(snapshot, scenario.name);
    await captureScreenshot(context.client, join(artifactDir, `${scenario.name}-fit.png`), {
      clip: await workflowGraphCanvasClip(context.client, surfaceId),
    });
    await writeJson(join(artifactDir, `${scenario.name}-fit.json`), {
      fit,
      initial,
      snapshot,
    });
    await writeScenarioReview(scenario, artifactDir);
    await assertNoRendererConsoleErrors(artifactDir);
    return {
      artifactDir,
      json: join(artifactDir, `${scenario.name}-fit.json`),
      mockup: scenario.mockup,
      name: scenario.name,
      png: join(artifactDir, `${scenario.name}-fit.png`),
      review: join(artifactDir, `${scenario.name}-review.html`),
      snapshot: scenarioSummarySnapshot(snapshot),
      status: "rendered",
      visualParity: "pending-parity-gate",
    };
  } catch (error) {
    if (context) {
      await captureScreenshot(context.client, join(artifactDir, "failure.png")).catch(() => {});
      if (surfaceId !== null) {
        await getWorkflowGraphSnapshot(context.client, surfaceId)
          .then((snapshot) => writeJson(join(artifactDir, "failure-snapshot.json"), snapshot))
          .catch(() => {});
      }
    }
    throw error;
  } finally {
    await stopElectronCdpContext(context);
  }
}

async function openFixtureWorkspace(client, workspaceRoot) {
  await client.evaluate(`window.setta.workspace.openPath(${JSON.stringify(workspaceRoot)})`);
}

function scenarioEnv(scenario) {
  const env = {
    SETTA_WORKFLOW_GRAPH_DEBUG: "1",
  };
  if (scenario.kind !== "synthetic") {
    return env;
  }
  return {
    ...env,
    SETTA_WORKFLOW_GRAPH_SYNTHETIC_EDGES_PER_NODE: String(scenario.synthetic.edgesPerNode),
    SETTA_WORKFLOW_GRAPH_SYNTHETIC_NODE_COUNT: String(scenario.synthetic.nodeCount),
    SETTA_WORKFLOW_GRAPH_SYNTHETIC_SCENE: scenario.synthetic.scene,
  };
}

async function waitForWorkflowGraphSnapshot(client, surfaceId, predicate, timeoutMs) {
  await client.installDriver();
  return waitForState(
    client,
    driverCallExpression("workflowGraphDebugSnapshotReady", { surfaceId }),
    (value) => value.ready && predicate(value.snapshot),
    timeoutMs,
  ).then((value) => value.snapshot);
}

async function getWorkflowGraphSnapshot(client, surfaceId) {
  return client.driver("workflowGraphDebugSnapshot", { surfaceId });
}

function scenarioSnapshotReady(snapshot, scenario) {
  return (
    snapshot.canvas.clientWidth > 0 &&
    snapshot.canvas.clientHeight > 0 &&
    snapshot.render.frameCount > 2 &&
    snapshot.visual.hasNonBackgroundPixels &&
    graphMatchesScenario(snapshot, scenario)
  );
}

function assertVisualScenarioSnapshot(snapshot, scenario) {
  if (!snapshot.visual.hasNonBackgroundPixels || snapshot.visual.sampledColorCount < 2) {
    throw new Error(`${scenario.name} canvas appears blank: ${JSON.stringify(snapshot.visual)}`);
  }
  if (!graphMatchesScenario(snapshot, scenario)) {
    throw new Error(
      `${scenario.name} graph did not match canonical scene: ${JSON.stringify(snapshot.graph)}`,
    );
  }
}

function graphMatchesScenario(snapshot, scenario) {
  const matcher = visualScenarioMatchers[scenario.name];
  if (!matcher) {
    throw new Error(`unsupported visual calibration scenario: ${scenario.name}`);
  }
  return matcher(snapshot, scenario);
}

function workflowIdleGraphMatches(snapshot) {
  return (
    snapshot.graph.nodes.length === 3 &&
    snapshot.graph.nodes.every(
      (node) => node.layer === "workflow" && node.status === "not_started",
    ) &&
    snapshot.graph.edges.every((edge) => edge.layer === "workflow" && edge.status === "inactive")
  );
}

function workflowRunningGraphMatches(snapshot) {
  return (
    hasWorkflowNodeStatus(snapshot, "running") &&
    hasWorkflowNodeStatus(snapshot, "succeeded") &&
    hasWorkflowNodeStatus(snapshot, "failed") &&
    snapshot.graph.edges.some((edge) => edge.layer === "workflow" && edge.status === "active")
  );
}

function semanticCellsGraphMatches(snapshot, scenario) {
  return (
    snapshot.graph.nodes.length === scenario.synthetic.nodeCount &&
    snapshot.graph.nodes.every((node) => node.layer === "semantic") &&
    snapshot.render.cellAnimCandidateCount > 0
  );
}

function mergedGraphMatches(snapshot, scenario) {
  return (
    snapshot.graph.nodes.length === scenario.synthetic.nodeCount &&
    snapshot.graph.nodes.some((node) => node.layer === "workflow") &&
    snapshot.graph.nodes.some((node) => node.layer === "semantic") &&
    snapshot.graph.edges.some((edge) => edge.layer === "workflow") &&
    snapshot.graph.edges.some((edge) => edge.layer === "semantic")
  );
}

function hasWorkflowNodeStatus(snapshot, status) {
  return snapshot.graph.nodes.some((node) => node.layer === "workflow" && node.status === status);
}

function assertNodesInsideCanvas(snapshot, label) {
  for (const node of snapshot.graph.nodes) {
    const halfWidth = (node.width * snapshot.camera.zoom) / 2;
    const halfHeight = (node.height * snapshot.camera.zoom) / 2;
    const left = node.screenX - halfWidth;
    const right = node.screenX + halfWidth;
    const top = node.screenY - halfHeight;
    const bottom = node.screenY + halfHeight;
    if (
      left < -1 ||
      top < -1 ||
      right > snapshot.canvas.clientWidth + 1 ||
      bottom > snapshot.canvas.clientHeight + 1
    ) {
      throw new Error(
        `${label} fit capture did not keep node inside the canvas: node=${JSON.stringify(node)} canvas=${JSON.stringify(snapshot.canvas)} camera=${JSON.stringify(snapshot.camera)}`,
      );
    }
  }
}

async function workflowGraphCanvasClip(client, surfaceId) {
  const rect = await client.driver("workflowGraphCanvasRect", { surfaceId });
  return {
    height: Math.max(1, rect.height),
    scale: 1,
    width: Math.max(1, rect.width),
    x: Math.max(0, rect.left),
    y: Math.max(0, rect.top),
  };
}

async function assertNoRendererConsoleErrors(artifactDir) {
  const consoleRows = await readJsonLinesOptional(join(artifactDir, "renderer-console.jsonl"));
  const consoleErrors = consoleRows.filter((row) => Number(row.level) >= 2);
  if (consoleErrors.length > 0) {
    throw new Error(`renderer console errors recorded: ${JSON.stringify(consoleErrors)}`);
  }
}

function scenarioSummarySnapshot(snapshot) {
  return {
    camera: snapshot.camera,
    edgeCount: snapshot.graph.edgeCount,
    nodeCount: snapshot.graph.nodeCount,
    render: {
      animationActive: snapshot.render.animationActive,
      cellAnimCandidateCount: snapshot.render.cellAnimCandidateCount,
      cellAnimCount: snapshot.render.cellAnimCount,
      totalDisplayObjectCount: snapshot.render.totalDisplayObjectCount,
    },
    visual: snapshot.visual,
  };
}

async function writeScenarioReview(scenario, artifactDir) {
  await writeReviewPage({
    outputPath: join(artifactDir, `${scenario.name}-review.html`),
    pairs: [
      {
        imagePath: join(artifactDir, `${scenario.name}-fit.png`),
        mockup: scenario.mockup,
        title: scenario.name,
      },
    ],
    title: `${scenario.name} Fit Review`,
  });
}

async function writeReviewIndex(results) {
  await writeReviewPage({
    outputPath: join(artifactRoot, "visual-calibration-review.html"),
    pairs: results.map((result) => ({
      imagePath: result.png,
      mockup: result.mockup,
      title: result.name,
    })),
    title: "Workflow Graph Visual Calibration Review",
  });
}

async function writeReviewPage({ outputPath, pairs, title }) {
  const sections = pairs
    .map(
      (pair) => `
      <section>
        <h2>${escapeHtml(pair.title)} production fit</h2>
        <img alt="${escapeHtml(pair.title)} production fit render" src="${pathToFileURL(pair.imagePath).href}">
      </section>
      <section>
        <h2>${escapeHtml(pair.title)} mockup</h2>
        <iframe title="${escapeHtml(pair.title)} mockup" src="${mockupUrl(pair.mockup)}"></iframe>
      </section>`,
    )
    .join("\n");
  await writeFile(
    outputPath,
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>${escapeHtml(title)}</title>
    <style>
      body {
        background: #05070b;
        color: #f7fbff;
        font: 14px system-ui, sans-serif;
        margin: 0;
      }
      main {
        display: grid;
        gap: 16px;
        grid-template-columns: 1fr 1fr;
        padding: 16px;
        box-sizing: border-box;
      }
      section {
        min-width: 0;
      }
      h1,
      h2 {
        font-size: 14px;
        font-weight: 650;
        margin: 0 0 8px;
      }
      h1 {
        grid-column: 1 / -1;
      }
      img,
      iframe {
        background: #000;
        border: 1px solid #263241;
        box-sizing: border-box;
        height: 640px;
        object-fit: contain;
        width: 100%;
      }
    </style>
  </head>
  <body>
    <main>
      <h1>${escapeHtml(title)}</h1>
      ${sections}
    </main>
  </body>
</html>
`,
    "utf8",
  );
}

function mockupUrl(mockup) {
  const [file, hash = ""] = mockup.split("#");
  return `${pathToFileURL(join(repoRoot, "docs/mockups", file)).href}${hash ? `#${hash}` : ""}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
