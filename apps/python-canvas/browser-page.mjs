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

export async function elementCenter(client, selector, description) {
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
    throw new Error(`${description} has no visible box on the page.`);
  }
  return point;
}

// A real pointer move. An idle canvas with a section under the cursor is the exact state the
// rejected per-section compositor promotion blurred, so the harness puts the pointer there rather
// than judging a canvas no pointer has touched.
export async function movePointerTo(client, point) {
  await client.send("Input.dispatchMouseEvent", {
    ...point,
    buttons: 0,
    type: "mouseMoved",
  });
}

// The canvas's own wheel zoom, dispatched with the modifier a trackpad pinch sends. This is the
// product's zoom rather than a store write, so what it proves is what a person's gesture does.
export async function pinchZoomCanvas(client, point, deltaY) {
  await client.send("Input.dispatchMouseEvent", {
    ...point,
    deltaX: 0,
    deltaY,
    modifiers: 2, // Ctrl, which is how a pinch arrives as a wheel event
    type: "mouseWheel",
  });
}

// A real pointer press on the element's centre. Synthetic focus does not reproduce what a person
// does to a field or a generated region, and the states this walkthrough judges are exactly the
// ones a click produces.
export async function clickElementCenter(client, selector, description) {
  const point = await elementCenter(client, selector, description);
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
  await pressPlatformModifierKey(client, {
    code: "KeyA",
    key: "a",
    keyCode: 65,
  });
}

// The platform chord the workspace's `Mod + K` binding resolves to, pressed as a real keyboard
// event so the package's own dispatcher decides what it means.
export async function pressModifierK(client) {
  await pressPlatformModifierKey(client, {
    code: "KeyK",
    key: "k",
    keyCode: 75,
  });
}

// The ordinary editing and caret keys an editor owns. Each one is a real key event, so the
// editor's own keymap decides what it means and its protected range decides whether it lands.
export async function pressBackspace(client) {
  await pressEditingKey(client, {
    code: "Backspace",
    key: "Backspace",
    keyCode: 8,
  });
}

export async function pressDelete(client) {
  await pressEditingKey(client, { code: "Delete", key: "Delete", keyCode: 46 });
}

export async function pressHome(client) {
  await pressEditingKey(client, { code: "Home", key: "Home", keyCode: 36 });
}

export async function pressEnd(client) {
  await pressEditingKey(client, { code: "End", key: "End", keyCode: 35 });
}

export async function pressLeftArrow(client) {
  await pressEditingKey(client, {
    code: "ArrowLeft",
    key: "ArrowLeft",
    keyCode: 37,
  });
}

export async function pressRightArrow(client) {
  await pressEditingKey(client, {
    code: "ArrowRight",
    key: "ArrowRight",
    keyCode: 39,
  });
}

// The editor's own history, on the chord this platform binds it to.
export async function pressUndo(client) {
  await pressPlatformModifierKey(client, {
    code: "KeyZ",
    key: "z",
    keyCode: 90,
  });
}

export async function pressRedo(client) {
  const isMac = process.platform === "darwin";
  if (isMac) {
    await pressPlatformModifierKey(client, {
      code: "KeyZ",
      key: "Z",
      keyCode: 90,
      shiftKey: true,
    });
    return;
  }
  await pressPlatformModifierKey(client, {
    code: "KeyY",
    key: "y",
    keyCode: 89,
  });
}

async function pressEditingKey(client, { code, key, keyCode }) {
  for (const type of ["rawKeyDown", "keyUp"]) {
    await client.send("Input.dispatchKeyEvent", {
      code,
      key,
      nativeVirtualKeyCode: keyCode,
      type,
      windowsVirtualKeyCode: keyCode,
    });
  }
}

async function pressPlatformModifierKey(
  client,
  { code, key, keyCode, shiftKey = false },
) {
  const isMac = process.platform === "darwin";
  const modifiers = (isMac ? 4 : 2) | (shiftKey ? 8 : 0);
  const modifierKey = isMac ? "Meta" : "Control";
  await client.send("Input.dispatchKeyEvent", {
    code: modifierKey,
    key: modifierKey,
    type: "keyDown",
  });
  if (shiftKey) {
    await client.send("Input.dispatchKeyEvent", {
      code: "ShiftLeft",
      key: "Shift",
      modifiers,
      type: "keyDown",
    });
  }
  for (const type of ["keyDown", "keyUp"]) {
    await client.send("Input.dispatchKeyEvent", {
      code,
      key,
      modifiers,
      type,
      windowsVirtualKeyCode: keyCode,
    });
  }
  if (shiftKey) {
    await client.send("Input.dispatchKeyEvent", {
      code: "ShiftLeft",
      key: "Shift",
      type: "keyUp",
    });
  }
  await client.send("Input.dispatchKeyEvent", {
    code: modifierKey,
    key: modifierKey,
    type: "keyUp",
  });
}

// The canvas's own item-selection gesture, the reference's held `Mod + Shift`. Rows only toggle
// while it is held, so a bulk delete has to hold it exactly as a person does.
export async function holdItemSelectionChord(client) {
  const isMac = process.platform === "darwin";
  await client.send("Input.dispatchKeyEvent", {
    code: isMac ? "MetaLeft" : "ControlLeft",
    key: isMac ? "Meta" : "Control",
    modifiers: isMac ? 4 : 2,
    type: "rawKeyDown",
  });
  await client.send("Input.dispatchKeyEvent", {
    code: "ShiftLeft",
    key: "Shift",
    modifiers: (isMac ? 4 : 2) | 8,
    type: "rawKeyDown",
  });
}

export async function releaseItemSelectionChord(client) {
  const isMac = process.platform === "darwin";
  await client.send("Input.dispatchKeyEvent", {
    code: "ShiftLeft",
    key: "Shift",
    modifiers: isMac ? 4 : 2,
    type: "keyUp",
  });
  await client.send("Input.dispatchKeyEvent", {
    code: isMac ? "MetaLeft" : "ControlLeft",
    key: isMac ? "Meta" : "Control",
    type: "keyUp",
  });
}

// A real pointer press at an exact page point, for rows a selector alone cannot single out.
export async function clickPoint(client, point) {
  const params = { button: "left", clickCount: 1, x: point.x, y: point.y };
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
