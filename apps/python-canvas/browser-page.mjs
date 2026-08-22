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

async function elementCenter(client, selector, description) {
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

export async function visibleElementPoint(
  client,
  selector,
  description,
  preferredYFraction = 0.5,
) {
  const result = await evaluate(
    client,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLElement)) {
        return { point: null, reason: "missing" };
      }
      const rect = element.getBoundingClientRect();
      const left = Math.max(0, rect.left);
      const right = Math.min(window.innerWidth, rect.right);
      const top = Math.max(0, rect.top);
      const bottom = Math.min(window.innerHeight, rect.bottom);
      if (right <= left || bottom <= top) {
        return { point: null, reason: "outside viewport", rect: rect.toJSON() };
      }
      const middleX = left + (right - left) / 2;
      const preferredY = top + (bottom - top) * ${JSON.stringify(preferredYFraction)};
      const points = [
        { x: left + 1, y: preferredY },
        { x: right - 1, y: preferredY },
        { x: middleX, y: top + 1 },
        { x: middleX, y: bottom - 1 },
      ];
      const fractions = [${JSON.stringify(preferredYFraction)}, 0.5, 0.25, 0.75, 0.1, 0.9];
      for (const yFraction of fractions) {
        for (const xFraction of fractions) {
          points.push({
            x: left + (right - left) * xFraction,
            y: top + (bottom - top) * yFraction,
          });
        }
      }
      const hits = [];
      for (const point of points) {
        if (document.elementFromPoint(point.x, point.y) === element) {
          return { point, reason: null };
        }
      }
      for (const point of points) {
        const hit = document.elementFromPoint(point.x, point.y);
        if (
          hit !== null &&
          element.contains(hit) &&
          hit.closest(".nodrag, button, input, textarea, [contenteditable='true']") === null
        ) {
          return { point, reason: null };
        }
        if (hit instanceof HTMLElement && hits.length < 5) {
          hits.push({
            ariaLabel: hit.getAttribute("aria-label"),
            className: hit.className,
            tagName: hit.tagName,
            text: hit.textContent?.trim().slice(0, 80),
          });
        }
      }
      return { hits, point: null, reason: "covered", rect: rect.toJSON() };
    })()`,
  );
  if (result?.point === null || result?.point === undefined) {
    throw new Error(
      `${description} has no pointer-reachable point: ${JSON.stringify(result)}.`,
    );
  }
  return result.point;
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

export async function rightClickPoint(client, point) {
  const params = {
    button: "right",
    clickCount: 1,
    modifiers: 0,
    x: point.x,
    y: point.y,
  };
  await client.send("Input.dispatchMouseEvent", {
    ...params,
    buttons: 2,
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
  const scrolled = await evaluate(
    client,
    `(() => {
      const element = document.querySelector(${JSON.stringify(selector)});
      if (!(element instanceof HTMLElement)) {
        return false;
      }
      element.scrollIntoView({ block: "center", inline: "center" });
      return true;
    })()`,
  );
  if (!scrolled) {
    throw new Error(`${description} is not on the page.`);
  }
  await nextAnimationFrame(client);
  await clickPoint(
    client,
    await elementCenter(client, selector, description),
    modifiers,
  );
}

export async function replaceNativeInputAndSubmit(
  client,
  selector,
  value,
  description,
) {
  await clickElementCenter(client, selector, description);
  await waitFor(
    client,
    `${description} keyboard focus`,
    `document.activeElement === document.querySelector(${JSON.stringify(selector)})`,
  );
  const replaced = await evaluate(
    client,
    `(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )?.set;
      if (!(input instanceof HTMLInputElement) || setter === undefined) {
        return false;
      }
      setter.call(input, ${JSON.stringify(value)});
      input.dispatchEvent(new Event("input", { bubbles: true }));
      return input.value === ${JSON.stringify(value)};
    })()`,
  );
  if (!replaced) {
    throw new Error(`${description} could not be edited.`);
  }
  await nextAnimationFrame(client);
  await waitFor(
    client,
    `${description} controlled value`,
    `document.querySelector(${JSON.stringify(selector)})?.value === ${JSON.stringify(value)}`,
  );
  const submitReady = await evaluate(
    client,
    `(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      const button = input instanceof HTMLInputElement
        ? input.form?.querySelector("button[type='submit']")
        : null;
      if (!(button instanceof HTMLButtonElement)) {
        return false;
      }
      button.scrollIntoView({ block: "center", inline: "center" });
      return true;
    })()`,
  );
  if (!submitReady) {
    throw new Error(`${description} submit action is missing.`);
  }
  await nextAnimationFrame(client);
  const submitPoint = await evaluate(
    client,
    `(() => {
      const input = document.querySelector(${JSON.stringify(selector)});
      const button = input instanceof HTMLInputElement
        ? input.form?.querySelector("button[type='submit']")
        : null;
      if (!(button instanceof HTMLButtonElement)) {
        return null;
      }
      const rect = button.getBoundingClientRect();
      return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
    })()`,
  );
  if (submitPoint === null) {
    throw new Error(`${description} submit action is missing.`);
  }
  await clickPoint(client, submitPoint);
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
  await waitFor(
    client,
    `${description} enabled state`,
    `(() => {
      const control = document.querySelector(${JSON.stringify(selector)});
      return control instanceof HTMLElement &&
        control.getAttribute("aria-disabled") !== "true";
    })()`,
  );
  await clickElementCenter(client, selector, description);
  await nextAnimationFrame(client);
  const activationRequested = await evaluate(
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
  if (!activationRequested) {
    throw new Error(`${description} is not on the page.`);
  }
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
  await setActiveTextSelection(client, "all");
}

export async function moveCaretToDocumentStart(client) {
  await setActiveTextSelection(client, "start");
}

export async function moveCaretToDocumentEnd(client) {
  await setActiveTextSelection(client, "end");
}

async function setActiveTextSelection(client, mode) {
  const selected = await evaluate(
    client,
    `(() => {
      const control = document.activeElement;
      if (control instanceof HTMLInputElement || control instanceof HTMLTextAreaElement) {
        if (control.type === "number") {
          return false;
        }
        const start = ${JSON.stringify(mode)} === "end" ? control.value.length : 0;
        const end = ${JSON.stringify(mode)} === "all" ? control.value.length : start;
        control.setSelectionRange(start, end);
        return true;
      }
      if (!(control instanceof HTMLElement) || control.getAttribute("contenteditable") !== "true") {
        return false;
      }
      const selection = window.getSelection();
      if (selection === null) {
        return false;
      }
      const range = document.createRange();
      range.selectNodeContents(control);
      if (${JSON.stringify(mode)} !== "all") {
        range.collapse(${JSON.stringify(mode)} === "start");
      }
      selection.removeAllRanges();
      selection.addRange(range);
      document.dispatchEvent(new Event("selectionchange"));
      return true;
    })()`,
  );
  if (!selected) {
    throw new Error(`The active text control could not select ${mode}.`);
  }
  await nextAnimationFrame(client);
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
  const modifierProperty = modifier === "Meta" ? "metaKey" : "ctrlKey";
  await evaluate(
    client,
    `(() => {
      window.dispatchEvent(new Event("blur"));
      const target = document.querySelector('[data-workspace-item-id]') ??
        document.querySelector('[role="region"][aria-label="Workspace canvas"]');
      if (!(target instanceof HTMLElement)) {
        throw new Error("The workspace canvas is not mounted.");
      }
      target.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        code: "ShiftLeft",
        key: "Shift",
        shiftKey: true,
      }));
      target.dispatchEvent(new KeyboardEvent("keydown", {
        bubbles: true,
        cancelable: true,
        code: ${JSON.stringify(modifier === "Meta" ? "MetaLeft" : "ControlLeft")},
        key: ${JSON.stringify(modifier)},
        ${modifierProperty}: true,
        shiftKey: true,
      }));
    })()`,
  );
}

export async function releaseItemSelectionChord(client) {
  const modifier = platformModifier();
  const modifierProperty = modifier === "Meta" ? "metaKey" : "ctrlKey";
  await evaluate(
    client,
    `(() => {
      const target = document.querySelector('[role="region"][aria-label="Workspace canvas"]') ?? document;
      target.dispatchEvent(new KeyboardEvent("keyup", {
        bubbles: true,
        cancelable: true,
        code: ${JSON.stringify(modifier === "Meta" ? "MetaLeft" : "ControlLeft")},
        key: ${JSON.stringify(modifier)},
        shiftKey: true,
      }));
      target.dispatchEvent(new KeyboardEvent("keyup", {
        bubbles: true,
        cancelable: true,
        code: "ShiftLeft",
        key: "Shift",
      }));
      window.dispatchEvent(new Event("blur"));
    })()`,
  );
}

export async function prepareElementDrag(
  client,
  sourceSelector,
  targetSelector,
  description,
) {
  const scrolled = await evaluate(
    client,
    `(() => {
      const source = document.querySelector(${JSON.stringify(sourceSelector)});
      const target = document.querySelector(${JSON.stringify(targetSelector)});
      if (!(source instanceof HTMLElement) || !(target instanceof HTMLElement)) {
        return false;
      }
      source.scrollIntoView({ block: "center", inline: "center" });
      target.scrollIntoView({ block: "nearest", inline: "nearest" });
      return true;
    })()`,
  );
  if (!scrolled) {
    throw new Error(`${description} endpoints are not on the page.`);
  }
  await nextAnimationFrame(client);
  await delay(100);
  await client.send("Input.dispatchMouseEvent", {
    buttons: 0,
    type: "mouseMoved",
    x: 1,
    y: 1,
  });
  await nextAnimationFrame(client);
}

export async function dragElementToElement(
  client,
  sourceSelector,
  targetSelector,
  description,
  modifiers = 0,
) {
  await delay(250);
  const source = await visibleElementPoint(
    client,
    sourceSelector,
    `${description} source`,
  );
  const targetCenter = await elementCenter(
    client,
    targetSelector,
    `${description} target`,
  );
  const target = await visibleElementPoint(
    client,
    targetSelector,
    `${description} target`,
    targetCenter.y > source.y ? 0.75 : 0.25,
  );
  await client.send("Input.dispatchMouseEvent", {
    ...source,
    button: "left",
    buttons: 1,
    clickCount: 1,
    modifiers,
    type: "mousePressed",
  });
  await nextAnimationFrame(client);
  await client.send("Input.dispatchMouseEvent", {
    x: (source.x + target.x) / 2,
    y: (source.y + target.y) / 2,
    button: "left",
    buttons: 1,
    modifiers,
    type: "mouseMoved",
  });
  await nextAnimationFrame(client);
  await waitFor(
    client,
    `${description} drag activation`,
    `(() => {
      const source = document.querySelector(${JSON.stringify(sourceSelector)});
      return source === null || source.classList.contains("opacity-80");
    })()`,
  );
  await client.send("Input.dispatchMouseEvent", {
    ...target,
    button: "left",
    buttons: 1,
    modifiers,
    type: "mouseMoved",
  });
  await nextAnimationFrame(client);
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

export async function navigate(client, origin) {
  const loaded = client.waitForEvent("Page.loadEventFired", 15_000);
  await client.send("Page.navigate", { url: origin });
  await loaded;
}
