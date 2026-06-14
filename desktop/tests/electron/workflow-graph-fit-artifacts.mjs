import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { pathToFileURL } from "node:url";

import { captureScreenshot, repoRoot, writeJson } from "./electron-cdp-harness.mjs";

export async function captureWorkflowIdleFitReference({ artifactDir, client, surfaceId }) {
  const fit = await client.driver("fitWorkflowGraphToView", {
    maxZoom: 1,
    padding: 96,
    surfaceId,
  });
  if (!fit.ok) {
    throw new Error(`workflow-idle fit-to-view failed: ${JSON.stringify(fit)}`);
  }
  await delay(150);
  const snapshot = await client.driver("workflowGraphDebugSnapshot", { surfaceId });
  assertWorkflowIdleFitSnapshot(snapshot);
  await captureScreenshot(client, join(artifactDir, "workflow-idle-fit.png"), {
    clip: await workflowGraphCanvasClip(client, surfaceId),
  });
  await writeWorkflowIdleFitReview(artifactDir);
  await writeJson(join(artifactDir, "workflow-idle-fit.json"), {
    fit,
    snapshot,
  });
  return { fit, snapshot };
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

async function writeWorkflowIdleFitReview(artifactDir) {
  const appRenderUrl = pathToFileURL(join(artifactDir, "workflow-idle-fit.png")).href;
  const mockupUrl = `${pathToFileURL(join(repoRoot, "docs/mockups/workflow-graph-aesthetics.html")).href}#neon`;
  await writeFile(
    join(artifactDir, "workflow-idle-fit-review.html"),
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <title>Workflow Idle Fit Review</title>
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
        height: 100vh;
        padding: 16px;
        box-sizing: border-box;
      }
      section {
        min-width: 0;
      }
      h1 {
        font-size: 14px;
        font-weight: 650;
        margin: 0 0 8px;
      }
      img,
      iframe {
        background: #000;
        border: 1px solid #263241;
        box-sizing: border-box;
        height: calc(100vh - 56px);
        object-fit: contain;
        width: 100%;
      }
    </style>
  </head>
  <body>
    <main>
      <section>
        <h1>Production fit capture</h1>
        <img alt="workflow-idle-fit production render" src="${appRenderUrl}">
      </section>
      <section>
        <h1>Mockup #neon</h1>
        <iframe title="workflow graph neon mockup" src="${mockupUrl}"></iframe>
      </section>
    </main>
  </body>
</html>
`,
    "utf8",
  );
}

function assertWorkflowIdleFitSnapshot(snapshot) {
  const workflow = snapshot.graph.workflow;
  if (!workflow || workflow.viewMode !== "draft" || workflow.executionId !== "") {
    throw new Error(
      `workflow-idle fit capture was not a draft workflow graph: ${JSON.stringify(workflow)}`,
    );
  }
  const nonWorkflowNodes = snapshot.graph.nodes.filter((node) => node.layer !== "workflow");
  if (nonWorkflowNodes.length > 0) {
    throw new Error(
      `workflow-idle fit capture included non-workflow nodes: ${JSON.stringify(nonWorkflowNodes)}`,
    );
  }
  const nonIdleNodes = snapshot.graph.nodes.filter((node) => node.status !== "not_started");
  if (nonIdleNodes.length > 0) {
    throw new Error(
      `workflow-idle fit capture included non-idle node statuses: ${JSON.stringify(nonIdleNodes)}`,
    );
  }
  if (snapshot.camera.zoom > 1.0001) {
    throw new Error(
      `workflow-idle fit capture zoomed in above whole-graph scale: ${JSON.stringify(snapshot.camera)}`,
    );
  }
  assertNodesInsideCanvas(snapshot, "workflow-idle fit capture");
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
        `${label} did not fit node inside the canvas: node=${JSON.stringify(node)} canvas=${JSON.stringify(snapshot.canvas)} camera=${JSON.stringify(snapshot.camera)}`,
      );
    }
  }
}
