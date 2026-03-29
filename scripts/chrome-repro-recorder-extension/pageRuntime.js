const PAGE_RUNTIME_SOURCE = "setta.chrome-repro-recorder/page-runtime";
const MAX_STRING_LENGTH = 1000;
const MAX_DETAIL_TEXT_LENGTH = 250000;
const MAX_ARRAY_ITEMS = 10;
const MAX_OBJECT_KEYS = 20;
const MAX_DEPTH = 3;

if (!window.__SETTA_CHROME_REPRO_PAGE_RUNTIME_INSTALLED__) {
  window.__SETTA_CHROME_REPRO_PAGE_RUNTIME_INSTALLED__ = true;
  window.__SETTA_CHROME_REPRO_ACTIVE__ = true;

  let networkSequenceNumber = 0;
  let socketSequenceNumber = 0;

  function truncateString(value) {
    if (typeof value !== "string") {
      return value;
    }
    if (value.length <= MAX_STRING_LENGTH) {
      return value;
    }
    return `${value.slice(0, MAX_STRING_LENGTH)}...<truncated>`;
  }

  function safeToString(value) {
    if (typeof value === "string") {
      return truncateString(value);
    }
    try {
      return truncateString(String(value));
    } catch {
      return "[unserializable]";
    }
  }

  function captureDetailText(value) {
    if (typeof value !== "string") {
      return null;
    }
    if (value.length <= MAX_DETAIL_TEXT_LENGTH) {
      return value;
    }
    return `${value.slice(0, MAX_DETAIL_TEXT_LENGTH)}...<truncated>`;
  }

  function tryParseJsonText(value) {
    if (typeof value !== "string") {
      return null;
    }
    const trimmed = value.trim();
    if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
      return null;
    }
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }

  function getElementSummary(element) {
    if (!(element instanceof Element)) {
      return null;
    }
    return {
      tagName: element.tagName.toLowerCase(),
      id: element.id || null,
      testId: element.getAttribute("data-testid"),
      role: element.getAttribute("role"),
      text: truncateString(
        typeof element.textContent === "string"
          ? element.textContent.replace(/\s+/g, " ").trim()
          : "",
      ),
    };
  }

  function serializeError(error) {
    if (!(error instanceof Error)) {
      return safeToString(error);
    }
    return {
      name: error.name,
      message: truncateString(error.message),
      stack: truncateString(error.stack ?? ""),
    };
  }

  function toSerializable(value, depth = 0, seen = new WeakSet()) {
    if (value == null) {
      return value;
    }
    if (typeof value === "string") {
      return truncateString(value);
    }
    if (
      typeof value === "number" ||
      typeof value === "boolean" ||
      typeof value === "bigint"
    ) {
      return value;
    }
    if (typeof value === "function") {
      return `[Function ${value.name || "anonymous"}]`;
    }
    if (value instanceof Error) {
      return serializeError(value);
    }
    if (value instanceof Element) {
      return getElementSummary(value);
    }
    if (value instanceof Event) {
      return {
        type: value.type,
        target: getElementSummary(value.target),
      };
    }
    if (typeof Blob !== "undefined" && value instanceof Blob) {
      return {
        type: "Blob",
        size: value.size,
        mimeType: value.type || null,
      };
    }
    if (typeof FormData !== "undefined" && value instanceof FormData) {
      return {
        type: "FormData",
        entries: Array.from(value.entries())
          .slice(0, MAX_ARRAY_ITEMS)
          .map(([key, entry]) => [key, safeToString(entry)]),
      };
    }
    if (
      typeof URLSearchParams !== "undefined" &&
      value instanceof URLSearchParams
    ) {
      return truncateString(value.toString());
    }
    if (Array.isArray(value)) {
      if (depth >= MAX_DEPTH) {
        return `[Array(${value.length})]`;
      }
      return value
        .slice(0, MAX_ARRAY_ITEMS)
        .map((entry) => toSerializable(entry, depth + 1, seen));
    }
    if (typeof value === "object") {
      if (seen.has(value)) {
        return "[Circular]";
      }
      if (depth >= MAX_DEPTH) {
        return `[Object ${value.constructor?.name || "Object"}]`;
      }
      seen.add(value);
      const output = {};
      for (const [key, entry] of Object.entries(value).slice(
        0,
        MAX_OBJECT_KEYS,
      )) {
        output[key] = toSerializable(entry, depth + 1, seen);
      }
      seen.delete(value);
      return output;
    }
    return safeToString(value);
  }

  function previewBody(value) {
    if (value == null) {
      return null;
    }
    if (typeof value === "string") {
      return truncateString(value);
    }
    if (typeof value === "object") {
      return toSerializable(value);
    }
    return safeToString(value);
  }

  function bodyDetail(value) {
    if (typeof value === "string") {
      return {
        detailBodyText: captureDetailText(value),
        detailBodyJson: toSerializable(tryParseJsonText(value)),
      };
    }
    if (
      typeof URLSearchParams !== "undefined" &&
      value instanceof URLSearchParams
    ) {
      return {
        detailBodyText: captureDetailText(value.toString()),
      };
    }
    return {};
  }

  function previewMessageData(value) {
    if (typeof value === "string") {
      const parsed = tryParseJsonText(value);
      return {
        kind: "text",
        size: value.length,
        preview: truncateString(value),
        detailText: captureDetailText(value),
        detailJson: toSerializable(parsed),
      };
    }
    if (typeof ArrayBuffer !== "undefined" && value instanceof ArrayBuffer) {
      return {
        kind: "arraybuffer",
        size: value.byteLength,
        preview: `[ArrayBuffer ${value.byteLength} bytes]`,
      };
    }
    if (typeof Blob !== "undefined" && value instanceof Blob) {
      return {
        kind: "blob",
        size: value.size,
        preview: `[Blob ${value.size} bytes]`,
      };
    }
    return {
      kind: typeof value,
      size: null,
      preview: toSerializable(value),
    };
  }

  function postRuntimeEvent(type, payload) {
    window.postMessage(
      {
        source: PAGE_RUNTIME_SOURCE,
        event: {
          type,
          timestampMs: Date.now(),
          ...payload,
        },
      },
      "*",
    );
  }

  function patchConsole() {
    const levels = ["debug", "info", "log", "warn", "error"];
    for (const level of levels) {
      const original = console[level];
      if (typeof original !== "function") {
        continue;
      }
      console[level] = function patchedConsole(...args) {
        postRuntimeEvent("console", {
          level,
          args: args.map((entry) => toSerializable(entry)),
        });
        return original.apply(this, args);
      };
    }
  }

  function patchErrors() {
    window.addEventListener("error", (event) => {
      postRuntimeEvent("page-error", {
        message: truncateString(event.message || ""),
        filename: event.filename || null,
        lineno: event.lineno || null,
        colno: event.colno || null,
        error: serializeError(event.error),
      });
    });

    window.addEventListener("unhandledrejection", (event) => {
      postRuntimeEvent("unhandledrejection", {
        reason: toSerializable(event.reason),
      });
    });
  }

  function patchFetch() {
    if (typeof window.fetch !== "function") {
      return;
    }
    const originalFetch = window.fetch.bind(window);
    window.fetch = async function patchedFetch(input, init) {
      networkSequenceNumber += 1;
      const requestId = `fetch-${networkSequenceNumber}`;
      const requestUrl =
        typeof input === "string"
          ? input
          : input instanceof URL
            ? input.toString()
            : input instanceof Request
              ? input.url
              : safeToString(input);
      const method =
        typeof init?.method === "string"
          ? init.method
          : input instanceof Request
            ? input.method
            : "GET";
      const startedAt = performance.now();
      postRuntimeEvent("network-request", {
        requestId,
        transport: "fetch",
        method,
        url: requestUrl,
        body: previewBody(init?.body ?? null),
        ...bodyDetail(init?.body ?? null),
      });
      try {
        const response = await originalFetch(input, init);
        postRuntimeEvent("network-response", {
          requestId,
          transport: "fetch",
          method,
          url: response.url || requestUrl,
          status: response.status,
          ok: response.ok,
          durationMs: Math.round(performance.now() - startedAt),
          contentType: response.headers.get("content-type"),
        });
        return response;
      } catch (error) {
        postRuntimeEvent("network-error", {
          requestId,
          transport: "fetch",
          method,
          url: requestUrl,
          durationMs: Math.round(performance.now() - startedAt),
          error: serializeError(error),
        });
        throw error;
      }
    };
  }

  function patchXMLHttpRequest() {
    if (typeof XMLHttpRequest === "undefined") {
      return;
    }
    const requestMetaKey = "__settaChromeReproRequestMeta";
    const originalOpen = XMLHttpRequest.prototype.open;
    const originalSend = XMLHttpRequest.prototype.send;

    XMLHttpRequest.prototype.open = function patchedOpen(method, url, ...rest) {
      this[requestMetaKey] = {
        requestId: `xhr-${++networkSequenceNumber}`,
        method: safeToString(method),
        url: safeToString(url),
        startedAt: 0,
      };
      return originalOpen.call(this, method, url, ...rest);
    };

    XMLHttpRequest.prototype.send = function patchedSend(body) {
      const metadata = this[requestMetaKey] ?? {
        requestId: `xhr-${++networkSequenceNumber}`,
        method: "GET",
        url: null,
        startedAt: 0,
      };
      metadata.startedAt = performance.now();
      this[requestMetaKey] = metadata;
      postRuntimeEvent("network-request", {
        requestId: metadata.requestId,
        transport: "xhr",
        method: metadata.method,
        url: metadata.url,
        body: previewBody(body),
        ...bodyDetail(body),
      });
      this.addEventListener(
        "loadend",
        () => {
          postRuntimeEvent("network-response", {
            requestId: metadata.requestId,
            transport: "xhr",
            method: metadata.method,
            url: metadata.url,
            status: this.status,
            ok: this.status >= 200 && this.status < 300,
            durationMs: Math.round(performance.now() - metadata.startedAt),
            contentType: this.getResponseHeader("content-type"),
          });
        },
        { once: true },
      );
      this.addEventListener(
        "error",
        () => {
          postRuntimeEvent("network-error", {
            requestId: metadata.requestId,
            transport: "xhr",
            method: metadata.method,
            url: metadata.url,
            durationMs: Math.round(performance.now() - metadata.startedAt),
            error: "XMLHttpRequest error",
          });
        },
        { once: true },
      );
      return originalSend.call(this, body);
    };
  }

  function patchWebSocket() {
    if (typeof WebSocket === "undefined") {
      return;
    }

    const NativeWebSocket = window.WebSocket;

    function RecordingWebSocket(url, protocols) {
      const socket =
        protocols === undefined
          ? new NativeWebSocket(url)
          : new NativeWebSocket(url, protocols);
      const socketId = `ws-${++socketSequenceNumber}`;
      const socketUrl = typeof url === "string" ? url : safeToString(url);

      postRuntimeEvent("websocket-open", {
        socketId,
        url: socketUrl,
        phase: "connect",
      });

      socket.addEventListener("open", () => {
        postRuntimeEvent("websocket-open", {
          socketId,
          url: socket.url || socketUrl,
          protocol: socket.protocol || null,
          phase: "open",
        });
      });
      socket.addEventListener("message", (event) => {
        postRuntimeEvent("websocket-message", {
          socketId,
          url: socket.url || socketUrl,
          direction: "recv",
          ...previewMessageData(event.data),
        });
      });
      socket.addEventListener("close", (event) => {
        postRuntimeEvent("websocket-close", {
          socketId,
          url: socket.url || socketUrl,
          code: event.code,
          reason: truncateString(event.reason || ""),
          wasClean: event.wasClean,
        });
      });
      socket.addEventListener("error", () => {
        postRuntimeEvent("websocket-error", {
          socketId,
          url: socket.url || socketUrl,
        });
      });

      const nativeSend = socket.send.bind(socket);
      socket.send = function patchedSend(data) {
        postRuntimeEvent("websocket-message", {
          socketId,
          url: socket.url || socketUrl,
          direction: "send",
          ...previewMessageData(data),
        });
        return nativeSend(data);
      };

      return socket;
    }

    RecordingWebSocket.prototype = NativeWebSocket.prototype;
    Object.defineProperties(RecordingWebSocket, {
      CONNECTING: { value: NativeWebSocket.CONNECTING },
      OPEN: { value: NativeWebSocket.OPEN },
      CLOSING: { value: NativeWebSocket.CLOSING },
      CLOSED: { value: NativeWebSocket.CLOSED },
    });
    window.WebSocket = RecordingWebSocket;
  }

  patchConsole();
  patchErrors();
  patchFetch();
  patchXMLHttpRequest();
  patchWebSocket();
}
