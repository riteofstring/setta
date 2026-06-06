export class CDPClient {
  constructor(socket, timeoutMs) {
    this.listeners = new Map();
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
      throw new Error(result.exceptionDetails.text);
    }
    return result.result.value;
  }

  close() {
    this.socket.close();
  }

  on(method, handler) {
    const handlers = this.listeners.get(method) ?? new Set();
    handlers.add(handler);
    this.listeners.set(method, handlers);
    return () => {
      handlers.delete(handler);
      if (handlers.size === 0) {
        this.listeners.delete(method);
      }
    };
  }

  handleMessage(data) {
    const message = JSON.parse(data);
    if (!message.id) {
      this.emit(message.method, message.params);
      return;
    }
    if (!this.pending.has(message.id)) {
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

  emit(method, params) {
    if (!method) {
      return;
    }
    const handlers = this.listeners.get(method);
    if (!handlers) {
      return;
    }
    for (const handler of handlers) {
      handler(params);
    }
  }
}
