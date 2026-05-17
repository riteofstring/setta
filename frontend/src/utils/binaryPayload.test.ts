import { describe, expect, it } from "vitest";

import {
  binaryPayloadToArrayBuffer,
  binaryPayloadToBlob,
  binaryPayloadToUint8Array,
} from "./binaryPayload";

describe("binaryPayload", () => {
  it("normalizes text payloads returned for text/* downloads", async () => {
    const source = "task,status\nalpha,todo\n";

    await expect(binaryPayloadToUint8Array(source)).resolves.toEqual(
      new TextEncoder().encode(source),
    );
    await expect(binaryPayloadToBlob(source).text()).resolves.toBe(source);
  });

  it("normalizes Uint8Array payloads from the runtime transport", async () => {
    const source = new Uint8Array([97, 98, 99, 100]).subarray(1, 3);

    await expect(binaryPayloadToUint8Array(source)).resolves.toEqual(
      new Uint8Array([98, 99]),
    );
    await expect(binaryPayloadToArrayBuffer(source)).resolves.toHaveProperty(
      "byteLength",
      2,
    );
    await expect(binaryPayloadToBlob(source).text()).resolves.toBe("bc");
  });
});
