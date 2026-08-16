import { setTimeout as delay } from "node:timers/promises";

import { productionTimeoutMs } from "./browser-processes.mjs";

// The production walkthrough's page side: evaluating an expression in the running app, waiting for
// a condition, resolving a control by its accessible name, and the real keyboard and pointer input
// a person would use. Every selector here is an ARIA name or a documented package hook.

export async function evaluate(client, expression) {
  const response = await client.send("Runtime.evaluate", {
    awaitPromise: true,
    expression,
    returnByValue: true,
  });
  if (response.exceptionDetails) {
    throw new Error(
      `Browser evaluation failed: ${response.exceptionDetails.exception?.description ?? response.exceptionDetails.text}`,
    );
  }
  return response.result?.value;
}

export async function waitFor(client, description, expression) {
  const deadline = Date.now() + productionTimeoutMs;
  while (Date.now() < deadline) {
    const result = await evaluate(client, expression);
    if (result) {
      return result;
    }
    await delay(100);
  }
  throw new Error(`${description} did not occur within 30 seconds.`);
}

export function textBoxSelector(label) {
  return `[role="textbox"][aria-label=${JSON.stringify(label)}]`;
}

export function labeledSelector(label) {
  return `[aria-label=${JSON.stringify(label)}]`;
}

export async function activateTextBox(client, label) {
  const selector = textBoxSelector(label);
  const found = await evaluate(
    client,
    `(() => {
      const control = document.querySelector(${JSON.stringify(selector)});
      if (!(control instanceof HTMLElement)) {
        return false;
      }
      control.focus({ preventScroll: true });
      return true;
    })()`,
  );
  if (!found) {
    throw new Error(
      `Accessible text box ${JSON.stringify(label)} was not found.`,
    );
  }
  await waitFor(
    client,
    `live ${label} editor activation`,
    `(() => {
      const control = document.querySelector(${JSON.stringify(labeledSelector(label))});
      return control instanceof HTMLElement && control.getAttribute("contenteditable") === "true";
    })()`,
  );
  await evaluate(
    client,
    `(() => {
      const control = document.querySelector(${JSON.stringify(labeledSelector(label))});
      if (!(control instanceof HTMLElement)) {
        return false;
      }
      control.focus({ preventScroll: true });
      return document.activeElement === control;
    })()`,
  );
}

export async function insertText(client, value) {
  await client.send("Input.insertText", { text: value });
}

export async function pressEnter(client) {
  const params = {
    code: "Enter",
    key: "Enter",
    nativeVirtualKeyCode: 13,
    windowsVirtualKeyCode: 13,
  };
  await client.send("Input.dispatchKeyEvent", { ...params, type: "keyDown" });
  await client.send("Input.dispatchKeyEvent", { ...params, type: "keyUp" });
}

export async function pressTab(client) {
  const params = {
    code: "Tab",
    key: "Tab",
    nativeVirtualKeyCode: 9,
    windowsVirtualKeyCode: 9,
  };
  await client.send("Input.dispatchKeyEvent", {
    ...params,
    type: "rawKeyDown",
  });
  await client.send("Input.dispatchKeyEvent", { ...params, type: "keyUp" });
}

export async function pressEscape(client) {
  const params = {
    code: "Escape",
    key: "Escape",
    nativeVirtualKeyCode: 27,
    windowsVirtualKeyCode: 27,
  };
  await client.send("Input.dispatchKeyEvent", { ...params, type: "keyDown" });
  await client.send("Input.dispatchKeyEvent", { ...params, type: "keyUp" });
}

// A real pointer drag across an element, which is how a reader selects text they mean to copy.
// Unlike a programmatic range, it fails on a surface the browser refuses to select.
export async function dragSelectElement(client, selector, description) {
  const box = await evaluate(
    client,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLElement)) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      // Text taller than its section scrolls, and a pointer cannot travel outside the surface
      // the reader can actually see.
      const visible = element.closest("[data-workspace-section-editor]")?.getBoundingClientRect() ?? rect;
      const bottom = Math.min(rect.bottom, visible.bottom);
      const right = Math.min(rect.right, visible.right);
      if (right - rect.left < 8 || bottom - rect.top < 8) {
        return null;
      }
      return { bottom, left: rect.left, right, top: rect.top };
    })()`,
  );
  if (box === null) {
    throw new Error(`${description} was not visible to a real pointer drag.`);
  }
  const start = { x: box.left + 4, y: box.top + 4 };
  const end = { x: box.right - 4, y: box.bottom - 4 };
  await client.send("Input.dispatchMouseEvent", {
    ...start,
    button: "left",
    buttons: 1,
    clickCount: 1,
    type: "mousePressed",
  });
  await client.send("Input.dispatchMouseEvent", {
    ...end,
    button: "left",
    buttons: 1,
    type: "mouseMoved",
  });
  await client.send("Input.dispatchMouseEvent", {
    ...end,
    button: "left",
    buttons: 0,
    clickCount: 1,
    type: "mouseReleased",
  });
}

// A real pointer press on the element's centre. Synthetic focus does not reproduce what a person
// does to a field or a generated region, and the states this walkthrough judges are exactly the
// ones a click produces.
export async function clickElementCenter(client, selector, description) {
  const point = await evaluate(
    client,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLElement)) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) {
        return null;
      }
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`,
  );
  if (point === null) {
    throw new Error(`${description} was not visible to a real pointer click.`);
  }
  const params = {
    button: "left",
    clickCount: 1,
    x: point.x,
    y: point.y,
  };
  await client.send("Input.dispatchMouseEvent", {
    ...params,
    buttons: 1,
    type: "mousePressed",
  });
  await client.send("Input.dispatchMouseEvent", {
    ...params,
    buttons: 0,
    type: "mouseReleased",
  });
}

export async function selectAll(client) {
  const isMac = process.platform === "darwin";
  const modifier = isMac ? 4 : 2;
  const modifierKey = isMac ? "Meta" : "Control";
  await client.send("Input.dispatchKeyEvent", {
    code: modifierKey,
    key: modifierKey,
    type: "keyDown",
  });
  await client.send("Input.dispatchKeyEvent", {
    code: "KeyA",
    key: "a",
    modifiers: modifier,
    type: "keyDown",
    windowsVirtualKeyCode: 65,
  });
  await client.send("Input.dispatchKeyEvent", {
    code: "KeyA",
    key: "a",
    modifiers: modifier,
    type: "keyUp",
    windowsVirtualKeyCode: 65,
  });
  await client.send("Input.dispatchKeyEvent", {
    code: modifierKey,
    key: modifierKey,
    type: "keyUp",
  });
}

// The application follows the reader's system appearance, so the page's appearance is an input to
// every check and capture rather than whatever the host machine happens to prefer.
export async function setEmulatedAppearance(client, appearance) {
  if (appearance !== "light" && appearance !== "dark") {
    throw new Error(`Unknown workspace appearance: ${String(appearance)}.`);
  }
  await client.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: appearance }],
  });
}

export async function navigate(client, origin) {
  const loaded = client.waitForEvent("Page.loadEventFired", 15_000);
  await client.send("Page.navigate", { url: origin });
  await loaded;
}
