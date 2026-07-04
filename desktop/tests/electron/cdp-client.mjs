import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const driverScriptDir = dirname(fileURLToPath(import.meta.url));
const driverScriptPath = join(driverScriptDir, "browser-driver.js");
const driverExtensionScripts = [
  {
    installedExpression:
      'globalThis.__settaE2EDriver?.chatStreamPerformanceVersion === "setta-chat-stream-performance-driver-v1"',
    path: join(driverScriptDir, "chat-stream-performance-driver.js"),
  },
  {
    installedExpression:
      'globalThis.__settaE2EDriver?.chatLongTranscriptPerformanceVersion === "setta-chat-long-transcript-performance-driver-v1"',
    path: join(driverScriptDir, "chat-long-transcript-performance-driver.js"),
  },
  {
    installedExpression:
      'globalThis.__settaE2EDriver?.domPaneSnapshotScrollVersion === "setta-dom-pane-snapshot-scroll-driver-v1"',
    path: join(driverScriptDir, "dom-pane-snapshot-scroll-driver.js"),
  },
  {
    installedExpression:
      'globalThis.__settaE2EDriver?.semanticGraphWorkflowVersion === "setta-semantic-graph-workflow-driver-v1"',
    path: join(driverScriptDir, "semantic-graph-workflow-driver.js"),
  },
  {
    installedExpression:
      'globalThis.__settaE2EDriver?.overviewPerformanceVersion === "setta-overview-performance-driver-v1"',
    path: join(driverScriptDir, "overview-performance-driver.js"),
  },
  {
    installedExpression:
      'globalThis.__settaE2EDriver?.workflowNodeDetailsVersion === "setta-workflow-node-details-driver-v1"',
    path: join(driverScriptDir, "workflow-node-details-driver.js"),
  },
  {
    installedExpression:
      'globalThis.__settaE2EDriver?.terminalPaneCloseVersion === "setta-terminal-pane-close-driver-v1"',
    path: join(driverScriptDir, "terminal-pane-close-driver.js"),
  },
];

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

  on(method, listener) {
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
      throw new Error(
        result.exceptionDetails.exception?.description ??
          result.exceptionDetails.exception?.value ??
          result.exceptionDetails.text,
      );
    }
    return result.result.value;
  }

  async driver(method, args = {}) {
    await this.installDriver();
    return this.evaluate(driverCallExpression(method, args));
  }

  async installDriver() {
    const installed = await this.evaluate(
      `globalThis.__settaE2EDriver?.version === "setta-e2e-driver-v9"`,
    );
    if (!installed) {
      await this.evaluate(await readFile(driverScriptPath, "utf8"));
    }
    for (const extension of driverExtensionScripts) {
      await this.installDriverExtension(extension);
    }
  }

  async installDriverExtension({ installedExpression, path }) {
    const installed = await this.evaluate(installedExpression);
    if (!installed) {
      await this.evaluate(await readFile(path, "utf8"));
    }
  }

  close() {
    this.socket.close();
  }

  handleMessage(data) {
    const message = JSON.parse(data);
    if (message.method) {
      const listeners = this.eventListeners.get(message.method);
      if (listeners) {
        for (const listener of listeners) {
          listener(message.params ?? {});
        }
      }
      return;
    }
    if (!message.id || !this.pending.has(message.id)) {
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
}

export function driverCallExpression(method, args = {}) {
  return `globalThis.__settaE2EDriver.${method}(${JSON.stringify(args)})`;
}
