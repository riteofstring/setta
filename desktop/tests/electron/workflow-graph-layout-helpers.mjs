import { setTimeout as delay } from "node:timers/promises";

import {
  dispatchMouseClick as dispatchCdpMouseClick,
  dispatchWheel as dispatchCdpWheel,
  waitForState,
} from "./electron-cdp-harness.mjs";
import { driverCallExpression } from "./cdp-client.mjs";

export async function openWorkflowGraphPane(client, { timeoutMs } = {}) {
  const beforeCount = await visibleWorkflowGraphCount(client);
  if (beforeCount > 0) {
    return;
  }
  await openWorkflowGraphFromToolbar(client, timeoutMs);
  await waitForState(
    client,
    visibleWorkflowGraphCountExpression(),
    (count) => count > beforeCount,
    timeoutMs,
  );
}

export async function maximizeWorkflowGraphPane(client, { surfaceId = null, timeoutMs } = {}) {
  await client.installDriver();
  const maximized = await waitForState(
    client,
    driverCallExpression("maximizeWorkflowGraphPaneState", { surfaceId }),
    (value) => value.ok,
    timeoutMs,
  );
  const maximizedSurfaceId = maximized.surfaceId;
  await waitForWorkflowGraphPaneSettled(client, maximizedSurfaceId, timeoutMs);
  return maximizedSurfaceId;
}

export async function dispatchWorkflowGraphMouseClick(client, surfaceId, { modifiers = 0, x, y }) {
  await dispatchCdpMouseClick(client, {
    ...(await pagePointForCanvasPoint(client, surfaceId, { x, y })),
    modifiers,
  });
}

export async function dispatchWorkflowGraphContextMenu(client, surfaceId, { x, y }) {
  const point = await pagePointForCanvasPoint(client, surfaceId, { x, y });
  await client.call("Input.dispatchMouseEvent", {
    button: "none",
    type: "mouseMoved",
    x: point.x,
    y: point.y,
  });
  await client.call("Input.dispatchMouseEvent", {
    button: "right",
    buttons: 2,
    clickCount: 1,
    type: "mousePressed",
    x: point.x,
    y: point.y,
  });
  await delay(16);
  await client.call("Input.dispatchMouseEvent", {
    button: "right",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
    x: point.x,
    y: point.y,
  });
  return point;
}

export async function dispatchWorkflowGraphMouseMove(client, surfaceId, { x, y }) {
  await client.call("Input.dispatchMouseEvent", {
    button: "none",
    type: "mouseMoved",
    ...(await pagePointForCanvasPoint(client, surfaceId, { x, y })),
  });
}

export async function dispatchWorkflowGraphMouseDrag(
  client,
  surfaceId,
  { from, modifiers = 0, steps = 12, to },
) {
  const pageFrom = await pagePointForCanvasPoint(client, surfaceId, from);
  const pageTo = await pagePointForCanvasPoint(client, surfaceId, to);
  const shiftHeld = (modifiers & 8) !== 0;
  if (shiftHeld) {
    await client.call("Input.dispatchKeyEvent", {
      code: "ShiftLeft",
      key: "Shift",
      modifiers,
      type: "keyDown",
      windowsVirtualKeyCode: 16,
    });
  }
  try {
    await client.call("Input.dispatchMouseEvent", {
      button: "none",
      type: "mouseMoved",
      x: pageFrom.x,
      y: pageFrom.y,
    });
    await client.call("Input.dispatchMouseEvent", {
      button: "left",
      buttons: 1,
      clickCount: 1,
      modifiers,
      type: "mousePressed",
      x: pageFrom.x,
      y: pageFrom.y,
    });
    await delay(16);
    for (let step = 1; step <= steps; step += 1) {
      const progress = step / steps;
      await client.call("Input.dispatchMouseEvent", {
        button: "left",
        buttons: 1,
        modifiers,
        type: "mouseMoved",
        x: pageFrom.x + (pageTo.x - pageFrom.x) * progress,
        y: pageFrom.y + (pageTo.y - pageFrom.y) * progress,
      });
      await delay(16);
    }
    await client.call("Input.dispatchMouseEvent", {
      button: "left",
      buttons: 0,
      clickCount: 1,
      modifiers,
      type: "mouseReleased",
      x: pageTo.x,
      y: pageTo.y,
    });
  } finally {
    if (shiftHeld) {
      await client.call("Input.dispatchKeyEvent", {
        code: "ShiftLeft",
        key: "Shift",
        type: "keyUp",
        windowsVirtualKeyCode: 16,
      });
    }
  }
}

export async function dispatchWorkflowGraphWheel(
  client,
  surfaceId,
  { deltaX = 0, deltaY = 0, modifiers = 0, x, y },
) {
  await dispatchCdpWheel(client, {
    deltaX,
    deltaY,
    modifiers,
    ...(await pagePointForCanvasPoint(client, surfaceId, { x, y })),
  });
}

export async function pagePointForCanvasPoint(client, surfaceId, point) {
  const rect = await waitForWorkflowGraphCanvasRect(client, surfaceId);
  return {
    x: rect.left + point.x * (rect.width / rect.clientWidth),
    y: rect.top + point.y * (rect.height / rect.clientHeight),
  };
}

async function visibleWorkflowGraphCount(client) {
  return client.driver("visibleWorkflowGraphCount");
}

async function openWorkflowGraphFromToolbar(client, timeoutMs) {
  await client.installDriver();
  await waitForState(
    client,
    driverCallExpression("newFrameButtonOrWorkflowMenuExists"),
    (exists) => exists,
    timeoutMs,
  );
  const opened = await client.driver("openWorkflowGraphToolbarMenu");
  if (!opened.ok) {
    throw new Error(`Workspace new-frame toolbar button is missing: ${JSON.stringify(opened)}`);
  }
  await waitForState(
    client,
    driverCallExpression("workflowGraphMenuItemExists"),
    (exists) => exists,
    timeoutMs,
  );
  const selected = await client.driver("selectWorkflowGraphMenuItem");
  if (!selected.ok) {
    throw new Error(`Workflow Graph menu item is unavailable: ${JSON.stringify(selected)}`);
  }
}

function visibleWorkflowGraphCountExpression() {
  return driverCallExpression("visibleWorkflowGraphCount");
}

async function waitForWorkflowGraphCanvasRect(client, surfaceId) {
  await client.installDriver();
  const state = await waitForState(
    client,
    driverCallExpression("workflowGraphCanvasRectState", { surfaceId }),
    (value) => value.ready,
  );
  return state.rect;
}

async function waitForWorkflowGraphPaneSettled(client, surfaceId, timeoutMs) {
  await client.installDriver();
  await waitForState(
    client,
    driverCallExpression("workflowGraphPaneSettled", { surfaceId }),
    (value) =>
      value.visible &&
      !value.moving &&
      value.left >= 0 &&
      value.clientWidth > 0 &&
      value.clientHeight > 0 &&
      value.width > 0 &&
      value.height > 0,
    timeoutMs,
  );
}
