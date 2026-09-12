import { clearTimeout, setTimeout } from "node:timers";

const DEFAULT_TIMEOUT_MS = 10_000;

function timeoutError(description, timeoutMs) {
  return new Error(`${description} timed out after ${String(timeoutMs)} ms.`);
}

class CdpClient {
  #eventListeners = new Map();
  #nextId = 1;
  #pending = new Map();
  #socket;

  constructor(webSocketUrl) {
    this.#socket = new globalThis.WebSocket(webSocketUrl);
  }

  async connect(timeoutMs = DEFAULT_TIMEOUT_MS) {
    if (this.#socket.readyState === globalThis.WebSocket.OPEN) {
      return this;
    }
    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(timeoutError("Chrome DevTools connection", timeoutMs));
      }, timeoutMs);
      this.#socket.addEventListener(
        "open",
        () => {
          clearTimeout(timeout);
          resolve();
        },
        { once: true },
      );
      this.#socket.addEventListener(
        "error",
        () => {
          clearTimeout(timeout);
          reject(new Error("Chrome DevTools WebSocket connection failed."));
        },
        { once: true },
      );
    });
    this.#socket.addEventListener("message", (event) =>
      this.#handleMessage(event),
    );
    this.#socket.addEventListener("close", () => this.#handleClose());
    return this;
  }

  close() {
    this.#socket.close();
  }

  on(method, listener) {
    const listeners = this.#eventListeners.get(method) ?? new Set();
    listeners.add(listener);
    this.#eventListeners.set(method, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.#eventListeners.delete(method);
      }
    };
  }

  send(method, params = {}, timeoutMs = DEFAULT_TIMEOUT_MS) {
    if (this.#socket.readyState !== globalThis.WebSocket.OPEN) {
      throw new Error(
        `Cannot send ${method}; the Chrome DevTools connection is not open.`,
      );
    }
    const id = this.#nextId;
    this.#nextId += 1;
    const commandTimeout = timeoutError(
      `Chrome DevTools command ${method}`,
      timeoutMs,
    );
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.#pending.delete(id);
        reject(commandTimeout);
      }, timeoutMs);
      this.#pending.set(id, { method, reject, resolve, timeout });
      this.#socket.send(JSON.stringify({ id, method, params }));
    });
  }

  waitForEvent(method, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const eventTimeout = timeoutError(
      `Chrome DevTools event ${method}`,
      timeoutMs,
    );
    return new Promise((resolve, reject) => {
      let unsubscribe = () => {};
      const timeout = setTimeout(() => {
        unsubscribe();
        reject(eventTimeout);
      }, timeoutMs);
      unsubscribe = this.on(method, (params) => {
        clearTimeout(timeout);
        unsubscribe();
        resolve(params);
      });
    });
  }

  #handleClose() {
    const error = new Error(
      "Chrome DevTools WebSocket closed before all commands completed.",
    );
    for (const { reject, timeout } of this.#pending.values()) {
      clearTimeout(timeout);
      reject(error);
    }
    this.#pending.clear();
  }

  #handleMessage(event) {
    const message = JSON.parse(event.data);
    if (typeof message.id === "number") {
      const pending = this.#pending.get(message.id);
      if (!pending) {
        return;
      }
      clearTimeout(pending.timeout);
      this.#pending.delete(message.id);
      if (message.error) {
        pending.reject(
          new Error(
            `Chrome DevTools command ${pending.method} failed: ${String(message.error.message)}`,
          ),
        );
      } else {
        pending.resolve(message.result ?? {});
      }
      return;
    }
    if (typeof message.method !== "string") {
      return;
    }
    for (const listener of this.#eventListeners.get(message.method) ?? []) {
      listener(message.params ?? {});
    }
  }
}

export async function createCdpPage(port) {
  const response = await fetch(
    `http://127.0.0.1:${String(port)}/json/new?about%3Ablank`,
    {
      method: "PUT",
    },
  );
  if (!response.ok) {
    throw new Error(
      `Chrome DevTools target creation failed with HTTP ${String(response.status)}.`,
    );
  }
  const target = await response.json();
  if (
    typeof target.id !== "string" ||
    typeof target.webSocketDebuggerUrl !== "string"
  ) {
    throw new Error(
      "Chrome DevTools target creation returned a malformed target.",
    );
  }
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.connect();
  return { client, targetId: target.id };
}
