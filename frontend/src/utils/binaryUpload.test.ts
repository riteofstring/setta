import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { uploadBinaryPayload } from "./binaryUpload";

describe("uploadBinaryPayload", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("uploads bytes as FormData and returns the uploaded content id", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          contentId: "payload-123",
          byteLength: 3,
          mimeType: "text/plain",
          sha256: null,
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      ),
    );

    const result = await uploadBinaryPayload({
      bytes: new Uint8Array([65, 66, 67]),
      fileName: "sample.txt",
      mimeType: "text/plain",
    });

    expect(result).toEqual({
      status: "ok",
      contentId: "payload-123",
    });
    const request = fetchMock.mock.calls[0]?.[1];
    if (!(request instanceof Object) || !("body" in request)) {
      throw new Error("Expected fetch request options with FormData body.");
    }
    const body = request.body;
    if (!(body instanceof FormData)) {
      throw new Error("Expected FormData body.");
    }
    expect(body.get("durable")).toBe("false");
    expect(body.get("file")).toBeInstanceOf(Blob);
  });

  it("surfaces endpoint detail when upload fails", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: "Binary upload rejected." }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );

    const result = await uploadBinaryPayload({
      bytes: new Uint8Array([1, 2, 3]),
      fileName: "sample.bin",
      mimeType: null,
    });

    expect(result).toEqual({
      status: "failed",
      error: "Binary upload rejected.",
    });
  });
});
