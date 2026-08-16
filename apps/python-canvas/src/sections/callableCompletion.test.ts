import { describe, expect, it, vi } from "vitest";

import {
  callableIdentifierSegmentBounds,
  createCallableCompletionProvider,
} from "./callableCompletion";

describe("callableIdentifierSegmentBounds", () => {
  it("uses JavaScript UTF-16 bounds for the current Unicode identifier segment", () => {
    const value = "math.𝒜bc";

    expect(callableIdentifierSegmentBounds(value, 7)).toEqual({
      from: 5,
      to: value.length,
    });
    expect(callableIdentifierSegmentBounds("math.sq.other", 7)).toEqual({
      from: 5,
      to: 7,
    });
  });

  it("rejects an impossible cursor in the middle of a surrogate pair", () => {
    expect(() => callableIdentifierSegmentBounds("math.𝒜bc", 6)).toThrow(
      RangeError,
    );
  });
});

describe("createCallableCompletionProvider", () => {
  it("suppresses blank drafts without fetching", async () => {
    const fetchImplementation = vi.fn();
    const onSuccess = vi.fn();
    const provider = createCallableCompletionProvider({
      fetchImplementation: fetchImplementation as typeof fetch,
      onFailure: vi.fn(),
      onSuccess,
      projectId: "project:python-canvas",
      sectionId: "callable:square-root",
    });

    await expect(
      provider({
        cursorOffset: 1,
        explicit: false,
        signal: new AbortController().signal,
        value: " \t",
      }),
    ).resolves.toBeNull();

    expect(fetchImplementation).not.toHaveBeenCalled();
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("maps a strict response to the callable segment only", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValue(
        createJsonResponse({ items: [{ label: "sqrt", insertText: "sqrt" }] }),
      );
    const onSuccess = vi.fn();
    const provider = createCallableCompletionProvider({
      fetchImplementation: fetchImplementation as typeof fetch,
      onFailure: vi.fn(),
      onSuccess,
      projectId: "project:python-canvas",
      sectionId: "callable:square-root",
    });

    await expect(
      provider({
        cursorOffset: 7,
        explicit: false,
        signal: new AbortController().signal,
        value: "math.sq",
      }),
    ).resolves.toEqual({
      from: 5,
      options: [{ insertText: "sqrt", label: "sqrt" }],
      to: 7,
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      "/api/v1/project/callable/completions",
      expect.objectContaining({
        body: JSON.stringify({
          authoredExpression: "math.sq",
          cursorOffsetUtf16: 7,
          projectId: "project:python-canvas",
          sectionId: "callable:square-root",
        }),
      }),
    );
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("does not report an aborted or stale completion as an error", async () => {
    const response = createDeferred<Response>();
    const fetchImplementation = vi.fn().mockReturnValue(response.promise);
    const onFailure = vi.fn();
    const onSuccess = vi.fn();
    const provider = createCallableCompletionProvider({
      fetchImplementation: fetchImplementation as typeof fetch,
      onFailure,
      onSuccess,
      projectId: "project:python-canvas",
      sectionId: "callable:square-root",
    });
    const controller = new AbortController();
    const completion = provider({
      cursorOffset: 7,
      explicit: false,
      signal: controller.signal,
      value: "math.sq",
    });

    controller.abort();
    response.resolve(
      createJsonResponse({ items: [{ label: "sqrt", insertText: "sqrt" }] }),
    );

    await expect(completion).resolves.toBeNull();
    expect(onFailure).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
  });

  it("shows failures and clears them after a valid empty success", async () => {
    const onFailure = vi.fn();
    const onSuccess = vi.fn();
    const failedProvider = createCallableCompletionProvider({
      fetchImplementation: vi
        .fn()
        .mockRejectedValue(new Error("offline")) as typeof fetch,
      onFailure,
      onSuccess,
      projectId: "project:python-canvas",
      sectionId: "callable:square-root",
    });

    await expect(
      failedProvider({
        cursorOffset: 7,
        explicit: false,
        signal: new AbortController().signal,
        value: "math.sq",
      }),
    ).resolves.toBeNull();
    expect(onFailure).toHaveBeenCalledWith(
      "Unable to load callable completions. Unable to reach the project endpoint.",
    );

    const emptyProvider = createCallableCompletionProvider({
      fetchImplementation: vi
        .fn()
        .mockResolvedValue(createJsonResponse({ items: [] })) as typeof fetch,
      onFailure,
      onSuccess,
      projectId: "project:python-canvas",
      sectionId: "callable:square-root",
    });
    await expect(
      emptyProvider({
        cursorOffset: 7,
        explicit: false,
        signal: new AbortController().signal,
        value: "math.sq",
      }),
    ).resolves.toEqual({ from: 5, options: [], to: 7 });
    expect(onSuccess).toHaveBeenCalledTimes(1);
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
