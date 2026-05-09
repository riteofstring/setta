const PAGE_RUNTIME_SOURCE = "setta.chrome-repro-recorder/page-runtime";
const APP_STATE_SOURCE = "setta.chrome-repro-recorder/app-state";
const SCROLL_EVENT_THROTTLE_MS = 50;
const lastScrollEventByTarget = new WeakMap();

function nowTimestampMs() {
  return Date.now();
}

function normalizeText(value) {
  if (typeof value !== "string") {
    return null;
  }
  const normalized = value.replace(/\s+/g, " ").trim();
  return normalized ? normalized.slice(0, 200) : null;
}

function cssEscape(value) {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/[^a-zA-Z0-9_-]/g, "\\$&");
}

function buildCssPath(element) {
  const parts = [];
  let current = element;

  while (current instanceof Element && parts.length < 8) {
    if (current.id) {
      parts.unshift(`#${cssEscape(current.id)}`);
      break;
    }

    const tagName = current.tagName.toLowerCase();
    const testId = current.getAttribute("data-testid");
    if (testId) {
      parts.unshift(`${tagName}[data-testid="${testId.replace(/"/g, '\\"')}"]`);
      break;
    }

    let selector = tagName;
    const parent = current.parentElement;
    if (parent) {
      const sameTagSiblings = Array.from(parent.children).filter(
        (child) => child.tagName === current.tagName,
      );
      if (sameTagSiblings.length > 1) {
        selector += `:nth-of-type(${sameTagSiblings.indexOf(current) + 1})`;
      }
    }
    parts.unshift(selector);
    current = parent;
  }

  return parts.join(" > ");
}

function getElementTarget(rawTarget) {
  if (rawTarget instanceof Element) {
    return rawTarget;
  }
  if (rawTarget instanceof Node) {
    return rawTarget.parentElement;
  }
  return null;
}

function getLabeledByText(element) {
  const labelledBy = element.getAttribute("aria-labelledby");
  if (!labelledBy) {
    return null;
  }
  const ids = labelledBy
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
  const chunks = ids
    .map((id) => normalizeText(document.getElementById(id)?.textContent ?? ""))
    .filter(Boolean);
  if (chunks.length === 0) {
    return null;
  }
  return chunks.join(" ");
}

function getTargetDescriptor(element) {
  const textContent =
    normalizeText(element.innerText) ?? normalizeText(element.textContent);
  const labels =
    "labels" in element && element.labels
      ? Array.from(element.labels)
          .map((label) => normalizeText(label.textContent))
          .filter(Boolean)
      : [];

  return {
    tagName: element.tagName.toLowerCase(),
    id: element.id || null,
    testId: element.getAttribute("data-testid"),
    role: element.getAttribute("role"),
    ariaLabel: element.getAttribute("aria-label"),
    labelledByText: getLabeledByText(element),
    placeholder: element.getAttribute("placeholder"),
    name: element.getAttribute("name"),
    labels,
    text: textContent,
    cssPath: buildCssPath(element),
  };
}

function getElementValue(element) {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLSelectElement
  ) {
    return element.value;
  }
  if (element instanceof HTMLElement && element.isContentEditable) {
    return normalizeText(element.innerText);
  }
  return null;
}

function getScrollMetrics(element) {
  const style =
    element instanceof HTMLElement ? window.getComputedStyle(element) : null;
  return {
    scrollTop: "scrollTop" in element ? element.scrollTop : null,
    scrollLeft: "scrollLeft" in element ? element.scrollLeft : null,
    scrollHeight: "scrollHeight" in element ? element.scrollHeight : null,
    scrollWidth: "scrollWidth" in element ? element.scrollWidth : null,
    clientHeight: "clientHeight" in element ? element.clientHeight : null,
    clientWidth: "clientWidth" in element ? element.clientWidth : null,
    overflowX: style?.overflowX ?? null,
    overflowY: style?.overflowY ?? null,
  };
}

function isScrollableMetrics(metrics) {
  return (
    ((metrics.overflowY === "auto" || metrics.overflowY === "scroll") &&
      metrics.scrollHeight > metrics.clientHeight) ||
    ((metrics.overflowX === "auto" || metrics.overflowX === "scroll") &&
      metrics.scrollWidth > metrics.clientWidth)
  );
}

function getScrollableAncestors(element) {
  const ancestors = [];
  let current = element instanceof HTMLElement ? element : element.parentElement;
  while (current instanceof HTMLElement && ancestors.length < 8) {
    const scrollMetrics = getScrollMetrics(current);
    if (isScrollableMetrics(scrollMetrics)) {
      ancestors.push({
        target: getTargetDescriptor(current),
        scrollMetrics,
      });
    }
    current = current.parentElement;
  }
  return ancestors;
}

function getWheelPoint(event) {
  return {
    clientX: event.clientX,
    clientY: event.clientY,
    pageX: event.pageX,
    pageY: event.pageY,
    screenX: event.screenX,
    screenY: event.screenY,
  };
}

function getPointerPoint(event) {
  return {
    clientX: event.clientX,
    clientY: event.clientY,
    pageX: event.pageX,
    pageY: event.pageY,
    screenX: event.screenX,
    screenY: event.screenY,
    movementX: event.movementX,
    movementY: event.movementY,
  };
}

function sendEvent(payload) {
  try {
    chrome.runtime.sendMessage({ type: "record-event", event: payload }, () => {
      void chrome.runtime.lastError;
    });
  } catch {
    // Ignore recorder transport failures in the page context.
  }
}

function sendEventAfterCurrentEvent(getPayload) {
  const schedule =
    typeof queueMicrotask === "function"
      ? queueMicrotask
      : (callback) => Promise.resolve().then(callback);
  schedule(() => {
    sendEvent(getPayload());
  });
}

function injectPageRuntime() {
  const target = document.head || document.documentElement;
  if (
    !target ||
    target.querySelector('script[data-setta-chrome-repro-runtime="true"]')
  ) {
    return;
  }
  const script = document.createElement("script");
  script.src = chrome.runtime.getURL("pageRuntime.js");
  script.async = false;
  script.dataset.settaChromeReproRuntime = "true";
  script.addEventListener("load", () => {
    script.remove();
  });
  script.addEventListener("error", () => {
    script.remove();
  });
  target.appendChild(script);
}

window.addEventListener(
  "message",
  (event) => {
    if (
      event.source !== window ||
      !event.data ||
      typeof event.data !== "object"
    ) {
      return;
    }

    if (event.data.source === PAGE_RUNTIME_SOURCE && event.data.event) {
      sendEvent(event.data.event);
      return;
    }

    if (event.data.source === APP_STATE_SOURCE) {
      sendEvent({
        type: "app-state",
        timestampMs:
          typeof event.data.timestampMs === "number"
            ? event.data.timestampMs
            : nowTimestampMs(),
        kind: typeof event.data.kind === "string" ? event.data.kind : null,
        payload: event.data.payload ?? null,
        url: window.location.href,
        title: document.title,
      });
    }
  },
  true,
);

if (document.documentElement) {
  injectPageRuntime();
} else {
  document.addEventListener(
    "readystatechange",
    () => {
      if (document.documentElement) {
        injectPageRuntime();
      }
    },
    { once: true },
  );
}

function recordNavigation(kind) {
  sendEvent({
    type: "navigation",
    kind,
    url: window.location.href,
    title: document.title,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
    },
    timestampMs: nowTimestampMs(),
  });
}

function recordPointerLikeEvent(type, event) {
  if (!event.isTrusted) {
    return;
  }
  const element = getElementTarget(event.target);
  if (!element) {
    return;
  }
  sendEvent({
    type,
    timestampMs: nowTimestampMs(),
    button: "button" in event ? event.button : null,
    detail: "detail" in event ? event.detail : null,
    altKey: event.altKey,
    ctrlKey: event.ctrlKey,
    metaKey: event.metaKey,
    shiftKey: event.shiftKey,
    target: getTargetDescriptor(element),
  });
}

document.addEventListener(
  "click",
  (event) => {
    recordPointerLikeEvent("click", event);
  },
  true,
);

document.addEventListener(
  "dblclick",
  (event) => {
    recordPointerLikeEvent("dblclick", event);
  },
  true,
);

document.addEventListener(
  "pointermove",
  (event) => {
    if (!event.isTrusted || event.buttons === 0) {
      return;
    }
    const element = getElementTarget(event.target);
    if (!element) {
      return;
    }
    const target = getTargetDescriptor(element);
    const pointerPoint = getPointerPoint(event);
    const pointElement = document.elementFromPoint(event.clientX, event.clientY);
    const pointTarget =
      pointElement instanceof Element ? getTargetDescriptor(pointElement) : null;
    sendEventAfterCurrentEvent(() => ({
      type: "pointermove",
      timestampMs: nowTimestampMs(),
      ...pointerPoint,
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      isPrimary: event.isPrimary,
      button: event.button,
      buttons: event.buttons,
      width: event.width,
      height: event.height,
      pressure: event.pressure,
      tangentialPressure: event.tangentialPressure,
      tiltX: event.tiltX,
      tiltY: event.tiltY,
      twist: event.twist,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      defaultPrevented: event.defaultPrevented,
      target,
      pointTarget,
    }));
  },
  { capture: true, passive: true },
);

document.addEventListener(
  "wheel",
  (event) => {
    if (!event.isTrusted) {
      return;
    }
    const element = getElementTarget(event.target);
    if (!element) {
      return;
    }
    const target = getTargetDescriptor(element);
    const wheelPoint = getWheelPoint(event);
    const pointElement = document.elementFromPoint(event.clientX, event.clientY);
    const pointTarget =
      pointElement instanceof Element ? getTargetDescriptor(pointElement) : null;
    sendEventAfterCurrentEvent(() => ({
      type: "wheel",
      timestampMs: nowTimestampMs(),
      ...wheelPoint,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      deltaZ: event.deltaZ,
      deltaMode: event.deltaMode,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      defaultPrevented: event.defaultPrevented,
      target,
      pointTarget,
      scrollMetrics: getScrollMetrics(element),
      scrollAncestors: getScrollableAncestors(element),
    }));
  },
  { capture: true, passive: true },
);

document.addEventListener(
  "scroll",
  (event) => {
    const element = getElementTarget(event.target);
    if (!element) {
      return;
    }
    const now = nowTimestampMs();
    const last = lastScrollEventByTarget.get(element) ?? 0;
    if (now - last < SCROLL_EVENT_THROTTLE_MS) {
      return;
    }
    lastScrollEventByTarget.set(element, now);
    sendEvent({
      type: "scroll",
      timestampMs: now,
      target: getTargetDescriptor(element),
      scrollMetrics: getScrollMetrics(element),
    });
  },
  { capture: true, passive: true },
);

document.addEventListener(
  "input",
  (event) => {
    if (!event.isTrusted) {
      return;
    }
    const element = getElementTarget(event.target);
    if (!element) {
      return;
    }
    sendEvent({
      type: "input",
      timestampMs: nowTimestampMs(),
      inputType: "inputType" in event ? event.inputType ?? null : null,
      value: getElementValue(element),
      target: getTargetDescriptor(element),
    });
  },
  true,
);

document.addEventListener(
  "change",
  (event) => {
    if (!event.isTrusted) {
      return;
    }
    const element = getElementTarget(event.target);
    if (!element) {
      return;
    }
    sendEvent({
      type: "change",
      timestampMs: nowTimestampMs(),
      value: getElementValue(element),
      target: getTargetDescriptor(element),
    });
  },
  true,
);

document.addEventListener(
  "keydown",
  (event) => {
    if (!event.isTrusted) {
      return;
    }
    const element = getElementTarget(event.target);
    sendEvent({
      type: "keydown",
      timestampMs: nowTimestampMs(),
      key: event.key,
      code: event.code,
      altKey: event.altKey,
      ctrlKey: event.ctrlKey,
      metaKey: event.metaKey,
      shiftKey: event.shiftKey,
      target: element ? getTargetDescriptor(element) : null,
    });
  },
  true,
);

document.addEventListener(
  "submit",
  (event) => {
    if (!event.isTrusted) {
      return;
    }
    const element = getElementTarget(event.target);
    if (!element) {
      return;
    }
    sendEvent({
      type: "submit",
      timestampMs: nowTimestampMs(),
      target: getTargetDescriptor(element),
    });
  },
  true,
);

window.addEventListener("hashchange", () => {
  recordNavigation("hashchange");
});

window.addEventListener("popstate", () => {
  recordNavigation("popstate");
});

if (document.readyState === "complete") {
  recordNavigation("initial-complete");
} else {
  window.addEventListener(
    "load",
    () => {
      recordNavigation("load");
    },
    { once: true },
  );
}
