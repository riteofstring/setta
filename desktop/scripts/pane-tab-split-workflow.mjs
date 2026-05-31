import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";

export async function runPaneTabSplitWorkflow({
  captureScreenshot,
  client,
  recordingDir,
  waitForState,
}) {
  await resetPaneTabSplitWorkflowPage(client, waitForState);
  const initial = await waitForState(client, paneTabSplitStateExpression(), (value) => {
    return Boolean(
      value.ready &&
      value.paneCount > 0 &&
      value.paneCount < 4 &&
      value.tabDraggable === "false" &&
      value.tabHasGrip,
    );
  });
  const selection = await waitForState(
    client,
    paneUserSelectionExpression(),
    (value) =>
      value.ready &&
      value.chromeButtonUserSelect === "none" &&
      value.composerUserSelect === "text" &&
      value.messageUserSelect === "text" &&
      (value.summaryUserSelect === null || value.summaryUserSelect === "none") &&
      value.tabUserSelect === "none",
  );
  if (selection.bodyUserSelect !== "none") {
    throw new Error(`app root remained selectable: ${JSON.stringify(selection)}`);
  }
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
      value.overlay &&
      value.previewTarget === "right" &&
      value.splitTargets === 0 &&
      value.previewRect !== null &&
      value.previewRect.width > 0,
  );
  if (during.previewRect.left < initial.gridRect.left + initial.gridRect.width / 2) {
    throw new Error(`pane tab split preview highlighted wrong area: ${JSON.stringify(during)}`);
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
  if (expectedPaneCount < 3) {
    await clickButtonByAria(client, "Add settings pane");
  }
  const topSplit = await waitForState(
    client,
    paneTabThreePaneGeometryExpression(),
    (value) => value.ready && value.paneCount === 3 && value.bottomSpansFullWidth,
  );
  if (!topSplit.topPanesShareRow) {
    throw new Error(`three-pane top split geometry is wrong: ${JSON.stringify(topSplit)}`);
  }
  await captureScreenshot(client, join(recordingDir, "pane-tab-split-three-pane.png"));
  const settingsDrag = await waitForState(
    client,
    paneTabSettingsDragStateExpression(),
    (value) => value.ready && value.settingsTabRect !== null && value.gridRect !== null,
  );
  const settingsStart = {
    x: settingsDrag.settingsTabRect.left + Math.min(65, settingsDrag.settingsTabRect.width / 2),
    y: settingsDrag.settingsTabRect.top + settingsDrag.settingsTabRect.height / 2,
  };
  const settingsEnd = {
    x: settingsDrag.gridRect.left + settingsDrag.gridRect.width - 120,
    y: settingsDrag.gridRect.top + 90,
  };
  await client.call("Input.dispatchMouseEvent", {
    button: "none",
    type: "mouseMoved",
    x: settingsStart.x,
    y: settingsStart.y,
  });
  await delay(50);
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    clickCount: 1,
    type: "mousePressed",
    x: settingsStart.x,
    y: settingsStart.y,
  });
  for (let step = 1; step <= 12; step += 1) {
    await client.call("Input.dispatchMouseEvent", {
      button: "left",
      buttons: 1,
      type: "mouseMoved",
      x: settingsStart.x + ((settingsEnd.x - settingsStart.x) * step) / 12,
      y: settingsStart.y + ((settingsEnd.y - settingsStart.y) * step) / 12,
    });
    await delay(35);
  }
  await waitForState(
    client,
    paneTabSplitOverlayExpression(),
    (value) =>
      value.overlay &&
      value.previewTarget === "top-right" &&
      value.splitTargets === 0 &&
      value.previewRect !== null &&
      value.previewRect.width > 0,
  );
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    clickCount: 1,
    type: "mouseReleased",
    x: settingsEnd.x,
    y: settingsEnd.y,
  });
  const settingsTopRight = await waitForState(
    client,
    paneTabSettingsTopRightExpression(),
    (value) =>
      value.ready &&
      value.topLeftKind === "chat" &&
      value.topRightKind === "settings" &&
      value.bottomKind === "chat" &&
      value.bottomSpansFullWidth,
  );
  if (!settingsTopRight.topPanesShareRow) {
    throw new Error(
      `settings top-right split geometry is wrong: ${JSON.stringify(settingsTopRight)}`,
    );
  }
  await captureScreenshot(client, join(recordingDir, "pane-tab-split-settings-top-right.png"));
}

async function resetPaneTabSplitWorkflowPage(client, waitForState) {
  await client.call("Page.reload", { ignoreCache: true });
  await waitForState(
    client,
    paneTabSplitStateExpression(),
    (value) => value.ready && value.paneCount === 1,
  );
  await client.evaluate(`(() => {
    window.findWorkflowButton = (kind, expected) => {
      const buttons = Array.from(document.querySelectorAll("button"));
      return buttons.find((button) => {
        if (kind === "aria-label") {
          return button.getAttribute("aria-label") === expected;
        }
        return button.innerText.trim() === expected;
      }) ?? null;
    };
  })()`);
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

function paneUserSelectionExpression() {
  return `(() => {
    const style = (selector) => {
      const element = document.querySelector(selector);
      return element ? getComputedStyle(element).userSelect : null;
    };
    return {
      chromeButtonUserSelect: style('button[aria-label="Add settings pane"]'),
      composerUserSelect: style('textarea[aria-label="Ask Setta"]'),
      bodyUserSelect: getComputedStyle(document.body).userSelect,
      messageUserSelect: style('[data-chat-message="true"]'),
      ready: Boolean(
        document.querySelector('[data-testid^="workspace-pane-tab-"] span:last-of-type') &&
          document.querySelector('[data-chat-message="true"]') &&
          document.querySelector('textarea[aria-label="Ask Setta"]') &&
          document.querySelector('button[aria-label="Add settings pane"]'),
      ),
      summaryUserSelect: style('[data-chat-message="true"] summary'),
      tabUserSelect: style('[data-testid^="workspace-pane-tab-"] span:last-of-type'),
    };
  })()`;
}

function paneTabSplitOverlayExpression() {
  return `(() => {
    const preview = document.querySelector('[data-testid="workspace-split-preview"]');
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
      overlay: Boolean(document.querySelector('[data-testid="workspace-split-overlay"]')),
      previewRect: rect(preview),
      previewTarget: preview?.getAttribute("data-split-target") ?? null,
      splitTargets: document.querySelectorAll('[data-testid^="workspace-split-target-"]').length,
    };
  })()`;
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

function paneTabThreePaneGeometryExpression() {
  return `(() => {
    const grid = document.querySelector('[data-testid="workspace-pane-grid-shell"]');
    const cells = [...document.querySelectorAll('[data-testid="workspace-pane-grid-cell"]')];
    const rect = (element) => {
      if (!element) {
        return null;
      }
      const value = element.getBoundingClientRect();
      return {
        bottom: value.bottom,
        height: value.height,
        left: value.left,
        right: value.right,
        top: value.top,
        width: value.width,
      };
    };
    const gridRect = rect(grid);
    const cellRects = cells.map(rect);
    const bottom = cellRects[2] ?? null;
    const topLeft = cellRects[0] ?? null;
    const topRight = cellRects[1] ?? null;
    return {
      bottomSpansFullWidth: Boolean(
        gridRect &&
          bottom &&
          bottom.left <= gridRect.left + 2 &&
          bottom.right >= gridRect.right - 2 &&
          bottom.top > gridRect.top + gridRect.height / 2 - 8,
      ),
      cellRects,
      paneCount: cells.length,
      ready: Boolean(gridRect && cells.length === 3),
      topPanesShareRow: Boolean(
        topLeft &&
          topRight &&
          Math.abs(topLeft.top - topRight.top) <= 2 &&
          Math.abs(topLeft.bottom - topRight.bottom) <= 2,
      ),
    };
  })()`;
}

function paneTabSettingsDragStateExpression() {
  return `(() => {
    const grid = document.querySelector('[data-testid="workspace-pane-grid-shell"]');
    const settingsTab = [...document.querySelectorAll('[data-testid^="workspace-pane-tab-"]')].find(
      (tab) => tab.innerText.includes("Settings"),
    );
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
      ready: Boolean(grid && settingsTab),
      settingsTabRect: rect(settingsTab),
    };
  })()`;
}

function paneTabSettingsTopRightExpression() {
  return `(() => {
    const grid = document.querySelector('[data-testid="workspace-pane-grid-shell"]');
    const cells = [...document.querySelectorAll('[data-testid="workspace-pane-grid-cell"]')];
    const rect = (element) => {
      if (!element) {
        return null;
      }
      const value = element.getBoundingClientRect();
      return {
        bottom: value.bottom,
        height: value.height,
        left: value.left,
        right: value.right,
        top: value.top,
        width: value.width,
      };
    };
    const kind = (cell) => cell?.querySelector("[data-pane-kind]")?.getAttribute("data-pane-kind") ?? null;
    const gridRect = rect(grid);
    const cellRects = cells.map(rect);
    const bottom = cellRects[2] ?? null;
    const topLeft = cellRects[0] ?? null;
    const topRight = cellRects[1] ?? null;
    return {
      bottomKind: kind(cells[2]),
      bottomSpansFullWidth: Boolean(
        gridRect &&
          bottom &&
          bottom.left <= gridRect.left + 2 &&
          bottom.right >= gridRect.right - 2 &&
          bottom.top > gridRect.top + gridRect.height / 2 - 8,
      ),
      cellRects,
      paneCount: cells.length,
      ready: Boolean(gridRect && cells.length === 3),
      topLeftKind: kind(cells[0]),
      topPanesShareRow: Boolean(
        topLeft &&
          topRight &&
          Math.abs(topLeft.top - topRight.top) <= 2 &&
          Math.abs(topLeft.bottom - topRight.bottom) <= 2,
      ),
      topRightKind: kind(cells[1]),
    };
  })()`;
}

async function clickButtonByAria(client, label) {
  const clicked = await client.evaluate(`(() => {
    const button = [...document.querySelectorAll("button")].find(
      (candidate) => candidate.getAttribute("aria-label") === ${JSON.stringify(label)},
    );
    if (!button || button.disabled) {
      return false;
    }
    button.click();
    return true;
  })()`);
  if (!clicked) {
    throw new Error(`button was not clickable: ${label}`);
  }
}
