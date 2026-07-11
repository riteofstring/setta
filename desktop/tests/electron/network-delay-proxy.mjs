import { createConnection, createServer } from "node:net";
import { Transform } from "node:stream";
import { setTimeout } from "node:timers";

export async function startNetworkDelayProxy({ delayMs, targetHost, targetPort }) {
  requireNonNegativeNumber(delayMs, "delayMs");
  const sockets = new Set();
  const server = createServer((client) => {
    const upstream = connectTrackedSocket(targetHost, targetPort, sockets);
    sockets.add(client);
    client.once("close", () => sockets.delete(client));
    client.once("error", () => upstream.destroy());
    upstream.once("error", () => client.destroy());
    client.pipe(delayedTransform(delayMs)).pipe(upstream);
    upstream.pipe(delayedTransform(delayMs)).pipe(client);
  });
  await new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
  const address = server.address();
  if (address === null || typeof address === "string") {
    throw new Error("network-delay proxy did not bind a TCP address");
  }
  return {
    delayMs,
    host: "127.0.0.1",
    port: address.port,
    url: `http://127.0.0.1:${address.port}`,
    async stop() {
      for (const socket of sockets) socket.destroy();
      await new Promise((resolvePromise, reject) =>
        server.close((error) => (error ? reject(error) : resolvePromise())),
      );
    },
  };
}

function connectTrackedSocket(host, port, sockets) {
  const socket = createConnection({ host, port });
  sockets.add(socket);
  socket.once("close", () => sockets.delete(socket));
  return socket;
}

function delayedTransform(delayMs) {
  let pending = 0;
  let finishFlush;
  return new Transform({
    flush(callback) {
      if (pending === 0) {
        callback();
        return;
      }
      finishFlush = callback;
    },
    transform(chunk, _encoding, callback) {
      pending += 1;
      setTimeout(() => {
        this.push(chunk);
        pending -= 1;
        if (pending === 0 && finishFlush) finishFlush();
      }, delayMs);
      callback();
    },
  });
}

function requireNonNegativeNumber(value, label) {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${label} must be a non-negative finite number`);
  }
}
