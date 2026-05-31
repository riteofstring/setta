import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export async function runPaneTabSplitWorkflow({
  captureScreenshot,
  client,
  recordingDir,
  waitForState,
}) {
  const initial = await waitForState(client, paneTabSplitStateExpression(), (value) => {
    return Boolean(
      value.ready &&
      value.paneCount > 0 &&
      value.paneCount < 4 &&
      value.tabDraggable === "false" &&
      value.tabHasGrip,
    );
  });
  const start = {
    x: initial.tabRect.left + Math.min(45, initial.tabRect.width / 2),
    y: initial.tabRect.top + initial.tabRect.height / 2,
  };
  const end = {
    x: initial.gridRect.left + initial.gridRect.width - 120,
    y: initial.gridRect.top + initial.gridRect.height / 2,
  };
  await client.call("Input.dispatchMouseEvent", {
    button: "none",
    type: "mouseMoved",
    x: start.x,
    y: start.y,
  });
  await delay(50);
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    clickCount: 1,
    type: "mousePressed",
    x: start.x,
    y: start.y,
  });
  for (let step = 1; step <= 12; step += 1) {
    await client.call("Input.dispatchMouseEvent", {
      button: "left",
      buttons: 1,
      type: "mouseMoved",
      x: start.x + ((end.x - start.x) * step) / 12,
      y: start.y + ((end.y - start.y) * step) / 12,
    });
    await delay(35);
  }
  const during = await waitForState(
    client,
    paneTabSplitOverlayExpression(),
    (value) =>
      value.splitTargets === 8 && value.activeRight === "true" && value.activeTargets.length === 1,
  );
  if (!during.activeTargets.includes("workspace-split-target-right")) {
    throw new Error(`pane tab split highlighted wrong target: ${JSON.stringify(during)}`);
  }
  await captureScreenshot(client, join(recordingDir, "pane-tab-split-during.png"));
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    clickCount: 1,
    type: "mouseReleased",
    x: end.x,
    y: end.y,
  });
  const expectedPaneCount = initial.paneCount === 1 ? 2 : initial.paneCount;
  await waitForState(
    client,
    paneTabSplitAfterDropExpression(),
    (value) =>
      value.paneCount === expectedPaneCount &&
      value.gridPaneCount === String(expectedPaneCount) &&
      value.splitTargets === 0 &&
      value.paneIds.some((paneId) => !initial.paneIds.includes(paneId)),
  );
}

function paneTabSplitStateExpression() {
  return `(() => {
    const tab = document.querySelector('[data-testid^="workspace-pane-tab-"]');
    const grid = document.querySelector('[data-testid="workspace-pane-grid-shell"]');
    const rect = (element) => {
      if (!element) {
        return null;
      }
      const value = element.getBoundingClientRect();
      return {
        height: value.height,
        left: value.left,
        top: value.top,
        width: value.width,
      };
    };
    return {
      gridRect: rect(grid),
      paneCount: document.querySelectorAll('[data-testid="workspace-pane-grid-cell"]').length,
      paneIds: [...document.querySelectorAll('[data-testid="workspace-pane-grid-cell"]')].map(
        (pane) => pane.getAttribute("data-pane-id"),
      ),
      ready: Boolean(tab && grid),
      tabDraggable: tab?.getAttribute("draggable") ?? null,
      tabHasGrip: Boolean(tab?.querySelector(".lucide-grip-vertical")),
      tabRect: rect(tab),
    };
  })()`;
}

function paneTabSplitOverlayExpression() {
  return `(() => ({
    activeRight: document
      .querySelector('[data-testid="workspace-split-target-right"]')
      ?.getAttribute("data-active-target") ?? null,
    activeTargets: [...document.querySelectorAll('[data-active-target="true"]')].map((element) =>
      element.getAttribute("data-testid"),
    ),
    overlayText: document.body.innerText.includes("Split tab"),
    splitTargets: document.querySelectorAll('[data-testid^="workspace-split-target-"]').length,
  }))()`;
}

function paneTabSplitAfterDropExpression() {
  return `(() => ({
    gridPaneCount: document
      .querySelector('[data-testid="workspace-pane-grid-shell"]')
      ?.getAttribute("data-pane-count") ?? null,
    paneCount: document.querySelectorAll('[data-testid="workspace-pane-grid-cell"]').length,
    paneIds: [...document.querySelectorAll('[data-testid="workspace-pane-grid-cell"]')].map(
      (pane) => pane.getAttribute("data-pane-id"),
    ),
    splitTargets: document.querySelectorAll('[data-testid^="workspace-split-target-"]').length,
  }))()`;
}
