import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import test from "node:test";

import { createServer } from "../src/server.ts";

test("GET / returns the fixture identity", async (context) => {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  context.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      }),
  );

  const address = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${address.port}/`);

  assert.equal(response.status, 200);
  assert.equal(response.headers.get("content-type"), "application/json");
  assert.deepEqual(await response.json(), { service: "setta-eval-fixture" });
});

test("unknown routes return 404", async (context) => {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  context.after(
    () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error === undefined ? resolve() : reject(error)));
      }),
  );

  const address = server.address() as AddressInfo;
  const response = await fetch(`http://127.0.0.1:${address.port}/missing`);

  assert.equal(response.status, 404);
  assert.deepEqual(await response.json(), { error: "not_found" });
});
