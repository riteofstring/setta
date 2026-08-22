import { describe, expect, it, vi } from "vitest";

import {
  callableIdentifierSegmentBounds,
  createCallableCompletionProvider,
} from "./callableCompletion";

describe("callableIdentifierSegmentBounds", () => {
  it("uses JavaScript UTF-16 bounds for the current Unicode identifier segment", () => {
    expect(callableIdentifierSegmentBounds("module.𝒜bc", 9)).toEqual({
      from: 7,
      to: 11,
    });
    expect(callableIdentifierSegmentBounds("module.value.other", 12)).toEqual({
      from: 7,
      to: 12,
    });
  });

  it("rejects a cursor in the middle of a surrogate pair", () => {
    expect(() => callableIdentifierSegmentBounds("module.𝒜bc", 8)).toThrow(
      RangeError,
    );
  });
});

describe("createCallableCompletionProvider", () => {
  it("isolates requests by callable ID and maps a strict response", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      createJsonResponse({
        items: [{ insertText: "value", label: "value" }],
      }),
    );
    const provider = createCallableCompletionProvider({
      callableId: "callable:one",
      fetchImplementation: fetchImplementation as typeof fetch,
      onFailure: vi.fn(),
      onSuccess: vi.fn(),
      projectId: "project:fixture",
    });

    await expect(
      provider({
        cursorOffset: 12,
        explicit: false,
        signal: new AbortController().signal,
        value: "module.value",
      }),
    ).resolves.toEqual({
      from: 7,
      options: [{ insertText: "value", label: "value" }],
      to: 12,
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      "/api/v2/project/callables/callable%3Aone/completions",
      expect.objectContaining({
        body: JSON.stringify({
          authoredExpression: "module.value",
          cursorOffsetUtf16: 12,
          projectId: "project:fixture",
        }),
      }),
    );
  });

  it("suppresses blank and aborted completions without reporting an error", async () => {
    const fetchImplementation = vi.fn();
    const onFailure = vi.fn();
    const provider = createCallableCompletionProvider({
      callableId: "callable:one",
      fetchImplementation: fetchImplementation as typeof fetch,
      onFailure,
      onSuccess: vi.fn(),
      projectId: "project:fixture",
    });

    await expect(
      provider({
        cursorOffset: 1,
        explicit: false,
        signal: new AbortController().signal,
        value: " ",
      }),
    ).resolves.toBeNull();
    expect(fetchImplementation).not.toHaveBeenCalled();

    const deferred = createDeferred<Response>();
    fetchImplementation.mockReturnValueOnce(deferred.promise);
    const controller = new AbortController();
    const pending = provider({
      cursorOffset: 5,
      explicit: false,
      signal: controller.signal,
      value: "value",
    });
    controller.abort();
    deferred.resolve(createJsonResponse({ items: [] }));

    await expect(pending).resolves.toBeNull();
    expect(onFailure).not.toHaveBeenCalled();
  });
});

function createJsonResponse(
  body: unknown,
): Response & { json: ReturnType<typeof vi.fn> } {
  return {
    json: vi.fn().mockResolvedValue(body),
    ok: true,
    status: 200,
  } as unknown as Response & { json: ReturnType<typeof vi.fn> };
}

function createDeferred<T>() {
  let resolve: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve: resolve! };
}
