import { describe, expect, it, vi } from "vitest";

import { createPythonTargetCompletionProvider } from "./pythonTargetCompletion";

const prefix = "import mat";
const generated = "\n\nclass SettaState:\n    pass\n\n";
const suffix = "state = SettaSta";
const text = `${prefix}${generated}${suffix}`;
const generatedRegion = {
  from: prefix.length,
  to: prefix.length + generated.length,
};

describe("createPythonTargetCompletionProvider", () => {
  it("splits the live document at its generated range and maps prefix replacements back to the full document", async () => {
    const fetchImplementation = vi
      .fn()
      .mockResolvedValue(
        createJsonResponse({ items: [{ insertText: "math", label: "math" }] }),
      );
    const provider = createPythonTargetCompletionProvider({
      fetchImplementation: fetchImplementation as typeof fetch,
      onFailure: vi.fn(),
      onSuccess: vi.fn(),
      projectId: "project:python-canvas",
    });

    await expect(
      provider({
        cursorOffsetUtf16: prefix.length - 1,
        generatedRegion,
        language: "python",
        sectionId: "generated-python",
        signal: new AbortController().signal,
        text,
        trigger: "typing",
      }),
    ).resolves.toEqual({
      from: prefix.length - 3,
      options: [{ insertText: "math", label: "math" }],
      to: prefix.length,
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      "/api/v1/project/python-target/completions",
      expect.objectContaining({
        body: JSON.stringify({
          cursorOffsetUtf16: prefix.length - 1,
          prefix,
          projectId: "project:python-canvas",
          region: "prefix",
          suffix,
        }),
      }),
    );
  });

  it("uses suffix-local UTF-16 offsets and returns a suffix-only replacement range", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      createJsonResponse({
        items: [{ insertText: "SettaState", label: "SettaState" }],
      }),
    );
    const provider = createPythonTargetCompletionProvider({
      fetchImplementation: fetchImplementation as typeof fetch,
      onFailure: vi.fn(),
      onSuccess: vi.fn(),
      projectId: "project:python-canvas",
    });

    await expect(
      provider({
        cursorOffsetUtf16: text.length,
        generatedRegion,
        language: "python",
        sectionId: "generated-python",
        signal: new AbortController().signal,
        text,
        trigger: "explicit",
      }),
    ).resolves.toEqual({
      from: generatedRegion.to + suffix.length - "SettaSta".length,
      options: [{ insertText: "SettaState", label: "SettaState" }],
      to: text.length,
    });
    expect(fetchImplementation).toHaveBeenCalledWith(
      "/api/v1/project/python-target/completions",
      expect.objectContaining({
        body: JSON.stringify({
          cursorOffsetUtf16: suffix.length,
          prefix,
          projectId: "project:python-canvas",
          region: "suffix",
          suffix,
        }),
      }),
    );
  });

  it("maps a non-ASCII prefix identifier from local UTF-16 bounds back into the full document", async () => {
    const unicodePrefix = "value = 𝒜bc";
    const unicodeText = `${unicodePrefix}${generated}${suffix}`;
    const unicodeRegion = {
      from: unicodePrefix.length,
      to: unicodePrefix.length + generated.length,
    };
    const fetchImplementation = vi
      .fn()
      .mockResolvedValue(
        createJsonResponse({
          items: [{ insertText: "Alpha", label: "Alpha" }],
        }),
      );
    const provider = createPythonTargetCompletionProvider({
      fetchImplementation: fetchImplementation as typeof fetch,
      onFailure: vi.fn(),
      onSuccess: vi.fn(),
      projectId: "project:python-canvas",
    });

    await expect(
      provider({
        cursorOffsetUtf16: unicodePrefix.length - 1,
        generatedRegion: unicodeRegion,
        language: "python",
        sectionId: "generated-python",
        signal: new AbortController().signal,
        text: unicodeText,
        trigger: "typing",
      }),
    ).resolves.toEqual({
      from: "value = ".length,
      options: [{ insertText: "Alpha", label: "Alpha" }],
      to: unicodePrefix.length,
    });
  });

  it("never queries from protected or non-Python content and ignores an aborted response", async () => {
    const response = createDeferred<Response>();
    const fetchImplementation = vi.fn().mockReturnValue(response.promise);
    const onFailure = vi.fn();
    const provider = createPythonTargetCompletionProvider({
      fetchImplementation: fetchImplementation as typeof fetch,
      onFailure,
      onSuccess: vi.fn(),
      projectId: "project:python-canvas",
    });

    await expect(
      provider({
        cursorOffsetUtf16: generatedRegion.from + 1,
        generatedRegion,
        language: "python",
        sectionId: "generated-python",
        signal: new AbortController().signal,
        text,
        trigger: "explicit",
      }),
    ).resolves.toBeNull();
    await expect(
      provider({
        cursorOffsetUtf16: prefix.length - 1,
        generatedRegion,
        language: "typescript",
        sectionId: "generated-python",
        signal: new AbortController().signal,
        text,
        trigger: "explicit",
      }),
    ).resolves.toBeNull();
    expect(fetchImplementation).not.toHaveBeenCalled();

    const controller = new AbortController();
    const completion = provider({
      cursorOffsetUtf16: prefix.length - 1,
      generatedRegion,
      language: "python",
      sectionId: "generated-python",
      signal: controller.signal,
      text,
      trigger: "typing",
    });
    controller.abort();
    response.resolve(
      createJsonResponse({ items: [{ insertText: "math", label: "math" }] }),
    );
    await expect(completion).resolves.toBeNull();
    expect(onFailure).not.toHaveBeenCalled();
  });

  it("reports a target completion failure through its own app-level callback", async () => {
    const onFailure = vi.fn();
    const provider = createPythonTargetCompletionProvider({
      fetchImplementation: vi
        .fn()
        .mockRejectedValue(new Error("offline")) as typeof fetch,
      onFailure,
      onSuccess: vi.fn(),
      projectId: "project:python-canvas",
    });

    await expect(
      provider({
        cursorOffsetUtf16: prefix.length - 1,
        generatedRegion,
        language: "python",
        sectionId: "generated-python",
        signal: new AbortController().signal,
        text,
        trigger: "typing",
      }),
    ).resolves.toBeNull();
    expect(onFailure).toHaveBeenCalledWith(
      "Unable to load Python target completions. Unable to reach the project endpoint.",
    );
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
