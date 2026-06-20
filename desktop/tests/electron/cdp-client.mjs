import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const driverScriptPath = join(dirname(fileURLToPath(import.meta.url)), "browser-driver.js");

export class CDPClient {
  constructor(socket, timeoutMs) {
    this.eventListeners = new Map();
    this.nextId = 1;
    this.pending = new Map();
    this.socket = socket;
    this.timeoutMs = timeoutMs;
    socket.addEventListener("message", (event) => {
      this.handleMessage(event.data);
    });
  }

  static async connect(url, timeoutMs) {
    const socket = new globalThis.WebSocket(url);
    await new Promise((resolvePromise, reject) => {
      socket.addEventListener("open", resolvePromise, { once: true });
      socket.addEventListener("error", reject, { once: true });
    });
    return new CDPClient(socket, timeoutMs);
  }

  call(method, params = {}) {
    const id = this.nextId;
    this.nextId += 1;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolvePromise, reject) => {
      const timeout = globalThis.setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP call timed out: ${method}`));
      }, this.timeoutMs);
      this.pending.set(id, {
        reject: (error) => {
          globalThis.clearTimeout(timeout);
          reject(error);
        },
        resolve: (value) => {
          globalThis.clearTimeout(timeout);
          resolvePromise(value);
        },
      });
    });
  }

  async evaluate(expression) {
    const result = await this.call("Runtime.evaluate", {
      awaitPromise: true,
      expression,
      returnByValue: true,
    });
    if (result.exceptionDetails) {
      throw new Error(runtimeExceptionMessage(result.exceptionDetails));
    }
    return result.result.value;
  }

  async driver(method, args = {}) {
    await this.installDriver();
    return this.evaluate(driverCallExpression(method, args));
  }

  async installDriver() {
    const installed = await this.evaluate(
      `globalThis.__settaE2EDriver?.version === "setta-e2e-driver-v6"`,
    );
    if (!installed) {
      await this.evaluate(await readFile(driverScriptPath, "utf8"));
    }
  }

  close() {
    this.socket.close();
  }

  onEvent(method, listener) {
    const listeners = this.eventListeners.get(method) ?? new Set();
    listeners.add(listener);
    this.eventListeners.set(method, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) {
        this.eventListeners.delete(method);
      }
    };
  }

  waitForEvent(method, timeoutMs = this.timeoutMs) {
    return new Promise((resolvePromise, reject) => {
      const timeout = globalThis.setTimeout(() => {
        off();
        reject(new Error(`CDP event timed out: ${method}`));
      }, timeoutMs);
      const off = this.onEvent(method, (params) => {
        globalThis.clearTimeout(timeout);
        off();
        resolvePromise(params);
      });
    });
  }

  handleMessage(data) {
    const message = JSON.parse(data);
    if (!message.id || !this.pending.has(message.id)) {
      if (typeof message.method === "string") {
        this.emitEvent(message.method, message.params ?? {});
      }
      return;
    }
    const pending = this.pending.get(message.id);
    this.pending.delete(message.id);
    if (message.error) {
      pending.reject(new Error(JSON.stringify(message.error)));
      return;
    }
    pending.resolve(message.result);
  }

  emitEvent(method, params) {
    const listeners = this.eventListeners.get(method);
    if (!listeners) {
      return;
    }
    for (const listener of listeners) {
      listener(params);
    }
  }
}

function runtimeExceptionMessage(exceptionDetails) {
  const description = exceptionDetails.exception?.description;
  if (typeof description === "string" && description.trim() !== "") {
    return description;
  }
  const value = exceptionDetails.exception?.value;
  if (typeof value === "string" && value.trim() !== "") {
    return value;
  }
  return exceptionDetails.text;
}

export function driverCallExpression(method, args = {}) {
  return `globalThis.__settaE2EDriver.${method}(${JSON.stringify(args)})`;
}
