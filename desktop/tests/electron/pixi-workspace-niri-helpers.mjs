import { setTimeout as delay } from "node:timers/promises";

import {
  dispatchMouseDrag as dispatchCdpMouseDrag,
  dispatchWheel as dispatchCdpWheel,
  waitForState,
} from "./electron-cdp-harness.mjs";

export async function openPixiWorkspacePane(client, { timeoutMs } = {}) {
  const beforeCount = await visiblePixiWorkspaceCount(client);
  if (beforeCount > 0) {
    return;
  }
  await openWorkflowGraphFromToolbar(client, timeoutMs);
  await waitForState(
    client,
    visiblePixiWorkspaceCountExpression(),
    (count) => count > beforeCount,
    timeoutMs,
  );
}

export async function maximizePixiWorkspacePane(client) {
  return client.evaluate(`(() => {
    const surfaces = [...document.querySelectorAll('[data-testid="pixi-workspace"]')];
    const visibleSurfaces = surfaces.filter((candidate) => {
      const rect = candidate.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 &&
        rect.left < window.innerWidth && rect.top < window.innerHeight;
    });
    const surface = visibleSurfaces.at(-1);
    const host = surface?.closest('[data-testid="niri-fake-pane-host"]');
    const button = host?.querySelector('[data-niri-pane-maximize-button="true"]');
    if (!(button instanceof HTMLButtonElement)) {
      throw new Error("Pixi workspace maximize button is missing");
    }
    button.click();
    return surface.dataset.surfaceId ?? null;
  })()`);
}

export async function dispatchPixiMouseClick(client, surfaceId, { modifiers = 0, x, y }) {
  const point = await pagePointForCanvasPoint(client, surfaceId, { x, y });
  await client.call("Input.dispatchMouseEvent", {
    button: "none",
    modifiers,
    type: "mouseMoved",
    x: point.x,
    y: point.y,
  });
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 1,
    clickCount: 1,
    modifiers,
    type: "mousePressed",
    x: point.x,
    y: point.y,
  });
  await delay(16);
  await client.call("Input.dispatchMouseEvent", {
    button: "left",
    buttons: 0,
    clickCount: 1,
    modifiers,
    type: "mouseReleased",
    x: point.x,
    y: point.y,
  });
}

export async function dispatchPixiContextMenu(client, surfaceId, { x, y }) {
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
}

export async function dispatchPixiMouseMove(client, surfaceId, { x, y }) {
  await client.call("Input.dispatchMouseEvent", {
    button: "none",
    type: "mouseMoved",
    ...(await pagePointForCanvasPoint(client, surfaceId, { x, y })),
  });
}

export async function dispatchPixiMouseDrag(
  client,
  surfaceId,
  { from, modifiers = 0, steps = 12, to },
) {
  await dispatchCdpMouseDrag(client, {
    from: await pagePointForCanvasPoint(client, surfaceId, from),
    modifiers,
    steps,
    to: await pagePointForCanvasPoint(client, surfaceId, to),
  });
}

export async function dispatchPixiWheel(
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
  const rect = await pixiCanvasRect(client, surfaceId);
  return {
    x: rect.left + point.x,
    y: rect.top + point.y,
  };
}

async function visiblePixiWorkspaceCount(client) {
  return client.evaluate(visiblePixiWorkspaceCountExpression());
}

async function openWorkflowGraphFromToolbar(client, timeoutMs) {
  await waitForState(
    client,
    newFrameButtonOrWorkflowMenuExistsExpression(),
    (exists) => exists,
    timeoutMs,
  );
  const opened = await client.evaluate(`(() => {
    if (workflowGraphMenuItem()) {
      return { ok: true, state: "already-open" };
    }
    const button = document.querySelector('button[aria-label="New frame"]');
    if (!(button instanceof HTMLButtonElement)) {
      return {
        buttons: [...document.querySelectorAll("button")].map((candidate) => ({
          ariaLabel: candidate.getAttribute("aria-label"),
          disabled: candidate.disabled,
          text: candidate.textContent?.trim() ?? "",
          title: candidate.title,
        })),
        ok: false,
        reason: "missing-new-frame-button",
      };
    }
    button.click();
    return { ok: true, state: "opened" };

    function workflowGraphMenuItem() {
      return [...document.querySelectorAll('button[role="menuitem"]')].find((candidate) =>
        candidate instanceof HTMLButtonElement && candidate.title === "Workflow Graph"
      );
    }
  })()`);
  if (!opened.ok) {
    throw new Error(`Niri new-frame toolbar button is missing: ${JSON.stringify(opened)}`);
  }
  await waitForState(
    client,
    workflowGraphMenuItemExistsExpression(),
    (exists) => exists,
    timeoutMs,
  );
  const selected = await client.evaluate(`(() => {
    const item = [...document.querySelectorAll('button[role="menuitem"]')].find((candidate) =>
      candidate instanceof HTMLButtonElement && candidate.title === "Workflow Graph"
    );
    if (!(item instanceof HTMLButtonElement)) {
      return { ok: false, reason: "missing-workflow-graph-menu-item" };
    }
    if (item.disabled) {
      return { ok: false, reason: "disabled-workflow-graph-menu-item" };
    }
    item.click();
    return { ok: true };
  })()`);
  if (!selected.ok) {
    throw new Error(`Workflow Graph menu item is unavailable: ${JSON.stringify(selected)}`);
  }
}

function visiblePixiWorkspaceCountExpression() {
  return `(() => {
    return [...document.querySelectorAll('[data-testid="pixi-workspace"]')]
      .filter((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0 && rect.right > 0 && rect.bottom > 0 &&
          rect.left < window.innerWidth && rect.top < window.innerHeight;
      }).length;
  })()`;
}

function workflowGraphMenuItemExistsExpression() {
  return `(() => {
    return [...document.querySelectorAll('button[role="menuitem"]')].some((candidate) =>
      candidate instanceof HTMLButtonElement && candidate.title === "Workflow Graph"
    );
  })()`;
}

function newFrameButtonOrWorkflowMenuExistsExpression() {
  return `(() => {
    return Boolean(document.querySelector('button[aria-label="New frame"]')) ||
      [...document.querySelectorAll('button[role="menuitem"]')].some((candidate) =>
        candidate instanceof HTMLButtonElement && candidate.title === "Workflow Graph"
      );
  })()`;
}

async function pixiCanvasRect(client, surfaceId) {
  return client.evaluate(`(() => {
    const roots = [...document.querySelectorAll('[data-testid="pixi-workspace"]')];
    const root = ${JSON.stringify(surfaceId)} === null
      ? roots[0]
      : roots.find((candidate) => candidate.dataset.surfaceId === ${JSON.stringify(surfaceId)});
    const canvas = root?.querySelector('[data-testid="pixi-workspace-canvas"]');
    if (!canvas) {
      throw new Error("Pixi workspace canvas is missing");
    }
    const rect = canvas.getBoundingClientRect();
    return { left: rect.left, top: rect.top };
  })()`);
}
