import { setTimeout as delay } from "node:timers/promises";

import { productionTimeoutMs } from "./browser-processes.mjs";

function platformModifier() {
  return process.platform === "darwin" ? "Meta" : "Control";
}

function platformModifierBit() {
  return process.platform === "darwin" ? 4 : 2;
}

export function itemSelectionModifiers() {
  return platformModifierBit() | 8;
}

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
    if (await evaluate(client, expression)) {
      return;
    }
    await delay(100);
  }
  throw new Error(`${description} did not occur within 30 seconds.`);
}

export function labeledSelector(label) {
  return `[aria-label=${JSON.stringify(label)}]`;
}

export function contentEditableTextBoxSelector(label) {
  return `[role="textbox"][aria-label=${JSON.stringify(label)}]`;
}

export async function elementCenter(client, selector, description) {
  const box = await evaluate(
    client,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLElement)) {
        return null;
      }
      const rect = element.getBoundingClientRect();
      return { height: rect.height, width: rect.width, x: rect.x, y: rect.y };
    })()`,
  );
  if (box === null) {
    throw new Error(`${description} is not on the page.`);
  }
  if (box.width <= 0 || box.height <= 0) {
    throw new Error(`${description} has no visible box on the page.`);
  }
  return { x: box.x + box.width / 2, y: box.y + box.height / 2 };
}

export async function clickPoint(client, point, modifiers = 0) {
  const params = {
    button: "left",
    clickCount: 1,
    modifiers,
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

export async function clickElementCenter(
  client,
  selector,
  description,
  modifiers = 0,
) {
  await clickPoint(
    client,
    await elementCenter(client, selector, description),
    modifiers,
  );
}

export async function focusElement(client, selector, description) {
  const focused = await evaluate(
    client,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      element.focus({ preventScroll: true });
      return document.activeElement === element;
    })()`,
  );
  if (!focused) {
    throw new Error(`${description} could not receive keyboard focus.`);
  }
}

export async function activateContentEditableTextBox(
  client,
  selector,
  description,
) {
  await clickElementCenter(client, selector, description);
  await waitFor(
    client,
    `${description} editor activation`,
    `(() => {
      const control = document.querySelector(${JSON.stringify(selector)});
      return control instanceof HTMLElement && control.getAttribute("contenteditable") === "true";
    })()`,
  );
  await focusElement(client, selector, description);
}

export async function activateCodeEditor(client, selector, description) {
  await focusElement(client, selector, description);
  await pressEnter(client);
  await waitFor(
    client,
    `${description} editor activation`,
    `(() => {
      const wrapper = document.querySelector(${JSON.stringify(selector)});
      const control = wrapper?.querySelector('[role="textbox"]');
      return control instanceof HTMLElement && control.getAttribute("contenteditable") === "true";
    })()`,
  );
}

export async function insertText(client, text) {
  await client.send("Input.insertText", { text });
}

export async function pressEnter(client) {
  await pressKey(client, {
    code: "Enter",
    key: "Enter",
    keyCode: 13,
  });
}

export async function pressEscape(client) {
  await pressKey(client, {
    code: "Escape",
    key: "Escape",
    keyCode: 27,
  });
}

export async function pressEnd(client) {
  await pressKey(client, { code: "End", key: "End", keyCode: 35 });
}

export async function pressCompletion(client) {
  const modifiers = 2;
  await client.send("Input.dispatchKeyEvent", {
    code: "ControlLeft",
    key: "Control",
    modifiers,
    type: "rawKeyDown",
  });
  for (const type of ["keyDown", "keyUp"]) {
    await client.send("Input.dispatchKeyEvent", {
      code: "Space",
      key: " ",
      modifiers,
      nativeVirtualKeyCode: 32,
      type,
      windowsVirtualKeyCode: 32,
    });
  }
  await client.send("Input.dispatchKeyEvent", {
    code: "ControlLeft",
    key: "Control",
    type: "keyUp",
  });
}

export async function selectAll(client) {
  await pressPlatformShortcut(client, {
    code: "KeyA",
    key: "a",
    keyCode: 65,
  });
}

export async function moveCaretToDocumentStart(client) {
  await pressPlatformShortcut(client, {
    code: "Home",
    key: "Home",
    keyCode: 36,
  });
}

export async function moveCaretToDocumentEnd(client) {
  await pressPlatformShortcut(client, {
    code: "End",
    key: "End",
    keyCode: 35,
  });
}

export async function pressItemActionMenuKey(client) {
  await client.send("Input.dispatchKeyEvent", {
    code: "ShiftLeft",
    key: "Shift",
    modifiers: 8,
    type: "rawKeyDown",
  });
  await pressKey(client, {
    code: "F10",
    key: "F10",
    keyCode: 121,
    modifiers: 8,
  });
  await client.send("Input.dispatchKeyEvent", {
    code: "ShiftLeft",
    key: "Shift",
    type: "keyUp",
  });
}

export async function holdItemSelectionChord(client) {
  const modifier = platformModifier();
  const modifierBit = platformModifierBit();
  await client.send("Input.dispatchKeyEvent", {
    code: modifier === "Meta" ? "MetaLeft" : "ControlLeft",
    key: modifier,
    modifiers: modifierBit,
    type: "rawKeyDown",
  });
  await client.send("Input.dispatchKeyEvent", {
    code: "ShiftLeft",
    key: "Shift",
    modifiers: modifierBit | 8,
    type: "rawKeyDown",
  });
}

export async function releaseItemSelectionChord(client) {
  const modifier = platformModifier();
  const modifierBit = platformModifierBit();
  await client.send("Input.dispatchKeyEvent", {
    code: "ShiftLeft",
    key: "Shift",
    modifiers: modifierBit,
    type: "keyUp",
  });
  await client.send("Input.dispatchKeyEvent", {
    code: modifier === "Meta" ? "MetaLeft" : "ControlLeft",
    key: modifier,
    type: "keyUp",
  });
}

export async function dragElementToElement(
  client,
  sourceSelector,
  targetSelector,
  description,
  modifiers = 0,
) {
  const source = await elementCenter(
    client,
    sourceSelector,
    `${description} source`,
  );
  const target = await elementCenter(
    client,
    targetSelector,
    `${description} target`,
  );
  await client.send("Input.dispatchMouseEvent", {
    ...source,
    button: "left",
    buttons: 1,
    clickCount: 1,
    modifiers,
    type: "mousePressed",
  });
  await client.send("Input.dispatchMouseEvent", {
    x: (source.x + target.x) / 2,
    y: (source.y + target.y) / 2,
    button: "left",
    buttons: 1,
    modifiers,
    type: "mouseMoved",
  });
  await client.send("Input.dispatchMouseEvent", {
    ...target,
    button: "left",
    buttons: 1,
    modifiers,
    type: "mouseMoved",
  });
  await client.send("Input.dispatchMouseEvent", {
    ...target,
    button: "left",
    buttons: 0,
    modifiers,
    type: "mouseReleased",
  });
}

export async function dragBetweenPoints(client, start, end) {
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
    type: "mouseReleased",
  });
}

export async function nextAnimationFrame(client) {
  await evaluate(
    client,
    "new Promise((resolve) => requestAnimationFrame(() => resolve(true)))",
  );
}

async function pressKey(client, { code, key, keyCode, modifiers = 0 }) {
  for (const type of ["keyDown", "keyUp"]) {
    await client.send("Input.dispatchKeyEvent", {
      code,
      key,
      modifiers,
      nativeVirtualKeyCode: keyCode,
      type,
      windowsVirtualKeyCode: keyCode,
    });
  }
}

async function pressPlatformShortcut(client, { code, key, keyCode }) {
  const modifier = platformModifier();
  const modifiers = platformModifierBit();
  await client.send("Input.dispatchKeyEvent", {
    code: modifier === "Meta" ? "MetaLeft" : "ControlLeft",
    key: modifier,
    modifiers,
    type: "rawKeyDown",
  });
  await pressKey(client, { code, key, keyCode, modifiers });
  await client.send("Input.dispatchKeyEvent", {
    code: modifier === "Meta" ? "MetaLeft" : "ControlLeft",
    key: modifier,
    type: "keyUp",
  });
}

export async function navigate(client, origin) {
  const loaded = client.waitForEvent("Page.loadEventFired", 15_000);
  await client.send("Page.navigate", { url: origin });
  await loaded;
}
