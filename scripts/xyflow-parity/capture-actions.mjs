import { setTimeout as delay } from "node:timers/promises";

export const SETTLE_DELAY_MS = 250;
const DRAG_MOVE_DELAY_MS = 8;
const MODIFIER_BITS = {
  alt: 1,
  control: 2,
  meta: 4,
  shift: 8,
};
const MODIFIER_KEYS = {
  alt: { code: "AltLeft", key: "Alt", windowsVirtualKeyCode: 18 },
  control: { code: "ControlLeft", key: "Control", windowsVirtualKeyCode: 17 },
  meta: { code: "MetaLeft", key: "Meta", windowsVirtualKeyCode: 91 },
  shift: { code: "ShiftLeft", key: "Shift", windowsVirtualKeyCode: 16 },
};
const MOUSE_BUTTONS = {
  left: { button: "left", buttons: 1 },
  middle: { button: "middle", buttons: 4 },
  right: { button: "right", buttons: 2 },
};

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

function modifierMask(modifiers = []) {
  return modifiers.reduce((mask, modifier) => {
    const bit = MODIFIER_BITS[modifier];
    if (bit === undefined) {
      throw new Error(`Unsupported input modifier: ${modifier}.`);
    }
    return mask | bit;
  }, 0);
}

async function pressModifiers(client, modifiers) {
  let mask = 0;
  for (const modifier of modifiers) {
    const key = MODIFIER_KEYS[modifier];
    if (!key) {
      throw new Error(`Unsupported input modifier: ${modifier}.`);
    }
    mask |= MODIFIER_BITS[modifier];
    await client.send("Input.dispatchKeyEvent", {
      ...key,
      modifiers: mask,
      type: "keyDown",
    });
  }
}

async function releaseModifiers(client, modifiers) {
  let mask = modifierMask(modifiers);
  for (const modifier of [...modifiers].reverse()) {
    const key = MODIFIER_KEYS[modifier];
    if (!key) {
      throw new Error(`Unsupported input modifier: ${modifier}.`);
    }
    mask &= ~MODIFIER_BITS[modifier];
    await client.send("Input.dispatchKeyEvent", {
      ...key,
      modifiers: mask,
      type: "keyUp",
    });
  }
}

async function actionPoint(
  client,
  selector,
  relativePoint = { x: 0.5, y: 0.5 },
) {
  return evaluate(
    client,
    `(() => {
      const selector = ${JSON.stringify(selector)};
      const relativePoint = ${JSON.stringify(relativePoint)};
      const element = document.querySelector(selector);
      if (!element) throw new Error('Scenario action target is missing: ' + selector);
      const style = getComputedStyle(element);
      const rect = element.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) {
        throw new Error('Scenario action target is not visible: ' + selector);
      }
      return {
        x: rect.left + rect.width * relativePoint.x,
        y: rect.top + rect.height * relativePoint.y,
      };
    })()`,
  );
}

async function sectionActionPoint(client, sectionId, pointKind = "body") {
  return evaluate(
    client,
    `(() => {
      const sectionId = ${JSON.stringify(sectionId)};
      const pointKind = ${JSON.stringify(pointKind)};
      const section = [...document.querySelectorAll('[data-section-id]')]
        .filter((element) => element.getAttribute('data-section-id') === sectionId && element.getAttribute('role') === 'group')
        .sort((left, right) => {
          const leftRect = left.getBoundingClientRect();
          const rightRect = right.getBoundingClientRect();
          return rightRect.width * rightRect.height - leftRect.width * leftRect.height;
        })[0];
      if (!section) throw new Error('Scenario section target is missing: ' + sectionId);
      const style = getComputedStyle(section);
      const rect = section.getBoundingClientRect();
      if (style.display === 'none' || style.visibility === 'hidden' || rect.width <= 0 || rect.height <= 0) {
        throw new Error('Scenario section target is not visible: ' + sectionId);
      }
      const candidates = pointKind === 'header'
        ? [[0.08, 0.14], [0.18, 0.14], [0.08, 0.25]]
        : [[0.12, 0.72], [0.82, 0.72], [0.2, 0.86], [0.1, 0.5]];
      for (const [relativeX, relativeY] of candidates) {
        const x = rect.left + rect.width * relativeX;
        const y = rect.top + rect.height * relativeY;
        const hit = document.elementFromPoint(x, y);
        if (
          hit instanceof Element &&
          section.contains(hit) &&
          !hit.closest('button, input, select, textarea, [contenteditable="true"], .cm-editor')
        ) {
          return { x, y };
        }
      }
      throw new Error('Scenario section target has no non-interactive ' + pointKind + ' point: ' + sectionId);
    })()`,
  );
}

function roundPoint(point) {
  return {
    x: Math.round(point.x * 1_000) / 1_000,
    y: Math.round(point.y * 1_000) / 1_000,
  };
}

function mouseButton(button = "left") {
  const value = MOUSE_BUTTONS[button];
  if (!value) {
    throw new Error(`Unsupported mouse button: ${button}.`);
  }
  return value;
}

async function settle(client) {
  await evaluate(
    client,
    "new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve(true))))",
  );
  await delay(SETTLE_DELAY_MS);
}

async function dispatchMouse(client, parameters) {
  await client.send("Input.dispatchMouseEvent", parameters);
}

async function clickPoint(client, point, action, button = "left") {
  const descriptor = mouseButton(button);
  const modifiers = modifierMask(action.modifiers);
  const modifierNames = action.modifiers ?? [];
  await pressModifiers(client, modifierNames);
  try {
    await dispatchMouse(client, {
      modifiers,
      type: "mouseMoved",
      x: point.x,
      y: point.y,
    });
    await dispatchMouse(client, {
      button: descriptor.button,
      buttons: descriptor.buttons,
      clickCount: 1,
      modifiers,
      type: "mousePressed",
      x: point.x,
      y: point.y,
    });
    await dispatchMouse(client, {
      button: descriptor.button,
      buttons: 0,
      clickCount: 1,
      modifiers,
      type: "mouseReleased",
      x: point.x,
      y: point.y,
    });
  } finally {
    await releaseModifiers(client, modifierNames);
  }
  await settle(client);
}

async function click(client, action) {
  const point = await actionPoint(
    client,
    action.selector,
    action.relativePoint,
  );
  await clickPoint(client, point, action, action.button ?? "left");
  return {
    id: action.id,
    kind: action.kind ?? "click",
    modifiers: action.modifiers ?? [],
    point: roundPoint(point),
    selector: action.selector,
  };
}

async function sectionClick(client, action) {
  const point = await sectionActionPoint(client, action.sectionId, "header");
  await clickPoint(client, point, action);
  return {
    id: action.id,
    kind: "section-click",
    modifiers: action.modifiers ?? [],
    point: roundPoint(point),
    sectionId: action.sectionId,
  };
}

async function dragPoints(client, action) {
  const start = action.sectionId
    ? await sectionActionPoint(
        client,
        action.sectionId,
        action.pointKind ?? "header",
      )
    : await actionPoint(
        client,
        action.selector,
        action.startRelativePoint ?? action.relativePoint,
      );
  if (action.endSelector) {
    return {
      end: await actionPoint(
        client,
        action.endSelector,
        action.endRelativePoint ?? action.relativePoint,
      ),
      start,
    };
  }
  if (action.delta) {
    return {
      end: { x: start.x + action.delta.x, y: start.y + action.delta.y },
      start,
    };
  }
  if (action.endRelativePoint) {
    return {
      end: await actionPoint(client, action.selector, action.endRelativePoint),
      start,
    };
  }
  throw new Error(`Drag action ${action.id} needs an end point or delta.`);
}

async function settleAfterModifiers(client, modifierNames) {
  if (modifierNames.length > 0) {
    await settle(client);
  }
}

async function dispatchDragStart(client, state) {
  await dispatchMouse(client, {
    modifiers: state.modifiers,
    type: "mouseMoved",
    x: state.start.x,
    y: state.start.y,
  });
  await dispatchMouse(client, {
    button: state.descriptor.button,
    buttons: state.descriptor.buttons,
    clickCount: 1,
    modifiers: state.modifiers,
    type: "mousePressed",
    x: state.start.x,
    y: state.start.y,
  });
}

async function dispatchDragMoves(client, state, steps) {
  for (let step = 1; step <= steps; step += 1) {
    const progress = step / steps;
    await dispatchMouse(client, {
      button: state.descriptor.button,
      buttons: state.descriptor.buttons,
      modifiers: state.modifiers,
      type: "mouseMoved",
      x: state.start.x + (state.end.x - state.start.x) * progress,
      y: state.start.y + (state.end.y - state.start.y) * progress,
    });
    await delay(DRAG_MOVE_DELAY_MS);
  }
}

async function completeDrag(client, action, state, heldPointer) {
  if (action.hold === true) {
    heldPointer.value = {
      button: state.descriptor.button,
      modifiers: state.modifiers,
      modifierNames: state.modifierNames,
      point: state.end,
    };
    return true;
  }
  await dispatchMouse(client, {
    button: state.descriptor.button,
    buttons: 0,
    clickCount: 1,
    modifiers: state.modifiers,
    type: "mouseReleased",
    x: state.end.x,
    y: state.end.y,
  });
  return false;
}

async function releaseUnretainedModifiers(client, retained, modifierNames) {
  if (!retained) {
    await releaseModifiers(client, modifierNames);
  }
}

async function drag(client, action, heldPointer) {
  if (heldPointer.value !== null) {
    throw new Error(
      `Drag action ${action.id} cannot start while an input is held.`,
    );
  }
  const { start, end } = await dragPoints(client, action);
  const descriptor = mouseButton(action.button ?? "left");
  const modifiers = modifierMask(action.modifiers);
  const modifierNames = action.modifiers ?? [];
  const state = { descriptor, end, modifiers, modifierNames, start };
  let retained = false;
  await pressModifiers(client, modifierNames);
  await settleAfterModifiers(client, modifierNames);
  try {
    await dispatchDragStart(client, state);
    await dispatchDragMoves(client, state, action.steps ?? 8);
    retained = await completeDrag(client, action, state, heldPointer);
  } finally {
    await releaseUnretainedModifiers(client, retained, modifierNames);
  }
  await settle(client);
  return {
    end: roundPoint(end),
    held: action.hold === true,
    id: action.id,
    kind: action.kind ?? "drag",
    modifiers: modifierNames,
    sectionId: action.sectionId ?? null,
    selector: action.selector ?? null,
    start: roundPoint(start),
  };
}

export async function releaseHeldPointer(client, heldPointer) {
  const held = heldPointer.value;
  if (held === null) {
    return;
  }
  heldPointer.value = null;
  try {
    await dispatchMouse(client, {
      button: held.button,
      buttons: 0,
      clickCount: 1,
      modifiers: held.modifiers,
      type: "mouseReleased",
      x: held.point.x,
      y: held.point.y,
    });
  } finally {
    await releaseModifiers(client, held.modifierNames);
  }
}

async function wheel(client, action) {
  const point = await actionPoint(
    client,
    action.selector,
    action.relativePoint,
  );
  const modifiers = modifierMask(action.modifiers);
  const modifierNames = action.modifiers ?? [];
  await pressModifiers(client, modifierNames);
  try {
    await dispatchMouse(client, {
      deltaX: action.deltaX ?? 0,
      deltaY: action.deltaY,
      modifiers,
      type: "mouseWheel",
      x: point.x,
      y: point.y,
    });
  } finally {
    await releaseModifiers(client, modifierNames);
  }
  await settle(client);
  return {
    deltaX: action.deltaX ?? 0,
    deltaY: action.deltaY,
    id: action.id,
    kind: "wheel",
    modifiers: modifierNames,
    point: roundPoint(point),
    selector: action.selector,
  };
}

async function hover(client, action) {
  const point = await actionPoint(
    client,
    action.selector,
    action.relativePoint,
  );
  await dispatchMouse(client, {
    type: "mouseMoved",
    x: point.x,
    y: point.y,
  });
  await settle(client);
  return {
    id: action.id,
    kind: "hover",
    point: roundPoint(point),
    selector: action.selector,
  };
}

async function typeText(client, action) {
  const point = await actionPoint(
    client,
    action.selector,
    action.relativePoint,
  );
  await clickPoint(client, point, action);
  await client.send("Input.insertText", { text: action.text });
  await settle(client);
  return {
    id: action.id,
    kind: "type",
    point: roundPoint(point),
    selector: action.selector,
    textLength: action.text.length,
  };
}

async function key(client, action, heldKey) {
  if (action.hold === true && heldKey.value !== null) {
    throw new Error(
      `Key action ${action.id} cannot start while a key is held.`,
    );
  }
  const modifiers = modifierMask(action.modifiers);
  const modifierNames = action.modifiers ?? [];
  await pressModifiers(client, modifierNames);
  let retained = false;
  try {
    await client.send("Input.dispatchKeyEvent", {
      code: action.code,
      key: action.key,
      modifiers,
      text: action.text,
      type: "keyDown",
      windowsVirtualKeyCode: action.windowsVirtualKeyCode,
    });
    if (action.hold === true) {
      heldKey.value = {
        code: action.code,
        key: action.key,
        modifiers,
        modifierNames,
        windowsVirtualKeyCode: action.windowsVirtualKeyCode,
      };
      retained = true;
    } else {
      await client.send("Input.dispatchKeyEvent", {
        code: action.code,
        key: action.key,
        modifiers,
        type: "keyUp",
        windowsVirtualKeyCode: action.windowsVirtualKeyCode,
      });
    }
  } finally {
    if (!retained) {
      await releaseModifiers(client, modifierNames);
    }
  }
  await settle(client);
  return {
    id: action.id,
    key: action.key,
    kind: "key",
    held: action.hold === true,
    modifiers: modifierNames,
  };
}

export async function releaseHeldKey(client, heldKey) {
  const held = heldKey.value;
  if (held === null) {
    return;
  }
  heldKey.value = null;
  try {
    await client.send("Input.dispatchKeyEvent", {
      code: held.code,
      key: held.key,
      modifiers: held.modifiers,
      type: "keyUp",
      windowsVirtualKeyCode: held.windowsVirtualKeyCode,
    });
  } finally {
    await releaseModifiers(client, held.modifierNames);
  }
}

function contextMenu(client, action) {
  return click(client, { ...action, button: "right" });
}

function pointerDrag(client, action, inputState) {
  return drag(client, action, inputState.heldPointer);
}

function keyboardKey(client, action, inputState) {
  return key(client, action, inputState.heldKey);
}

const ACTION_EXECUTORS = new Map([
  ["click", click],
  ["context-menu", contextMenu],
  ["section-click", sectionClick],
  ["drag", pointerDrag],
  ["section-drag", pointerDrag],
  ["wheel", wheel],
  ["hover", hover],
  ["type", typeText],
  ["key", keyboardKey],
]);

export async function executeAction(client, action, heldPointer, heldKey) {
  const kind = action.kind ?? "click";
  const executor = ACTION_EXECUTORS.get(kind);
  if (executor === undefined) {
    throw new Error(`Unsupported scenario action kind: ${kind}.`);
  }
  return executor(client, action, { heldKey, heldPointer });
}
