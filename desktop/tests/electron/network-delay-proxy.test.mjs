import assert from "node:assert/strict";
import { createConnection, createServer } from "node:net";
import { performance } from "node:perf_hooks";
import test from "node:test";

import { startNetworkDelayProxy } from "./network-delay-proxy.mjs";

test("delays both TCP directions without changing byte order", async () => {
  const backend = createServer((socket) => socket.on("data", (data) => socket.write(data)));
  await listen(backend);
  const backendAddress = backend.address();
  assert.notEqual(backendAddress, null);
  assert.equal(typeof backendAddress, "object");
  const proxy = await startNetworkDelayProxy({
    delayMs: 20,
    targetHost: "127.0.0.1",
    targetPort: backendAddress.port,
  });
  try {
    const startedAt = performance.now();
    const result = await roundTrip(proxy.port, ["ordered-", "bytes"]);
    assert.equal(result, "ordered-bytes");
    assert.ok(performance.now() - startedAt >= 35, "round trip should include both delays");
  } finally {
    await proxy.stop();
    await close(backend);
  }
});

function listen(server) {
  return new Promise((resolvePromise, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolvePromise);
  });
}

function close(server) {
  return new Promise((resolvePromise, reject) =>
    server.close((error) => (error ? reject(error) : resolvePromise())),
  );
}

function roundTrip(port, chunks) {
  return new Promise((resolvePromise, reject) => {
    const socket = createConnection({ host: "127.0.0.1", port });
    let output = "";
    socket.setEncoding("utf8");
    socket.once("error", reject);
    socket.on("data", (chunk) => {
      output += chunk;
      if (output.length === chunks.join("").length) {
        socket.end();
        resolvePromise(output);
      }
    });
    socket.once("connect", () => {
      for (const chunk of chunks) socket.write(chunk);
    });
  });
}
