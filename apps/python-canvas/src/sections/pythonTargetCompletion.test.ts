import { describe, expect, it, vi } from "vitest";

import { createPythonTargetCompletionProvider } from "./pythonTargetCompletion";

const prefix = "import val\n";
const body = "class SettaState:\n    pass";
const suffix = "\nstate = SettaSta";
const text = `${prefix}\n${body}\n${suffix}`;
const generatedRegion = {
  from: prefix.length + 1,
  to: prefix.length + 1 + body.length,
};

describe("createPythonTargetCompletionProvider", () => {
  it("sends one complete document and maps prefix completion offsets", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      createJsonResponse({
        items: [{ insertText: "value", label: "value" }],
      }),
    );
    const provider = createPythonTargetCompletionProvider({
      fetchImplementation: fetchImplementation as typeof fetch,
      onFailure: vi.fn(),
      onSuccess: vi.fn(),
      projectId: "project:fixture",
    });

    await expect(
      provider({
        cursorOffsetUtf16: "import val".length,
        generatedRegion,
        language: "python",
        sectionId: "python-canvas:generated-python",
        signal: new AbortController().signal,
        text,
        trigger: "typing",
      }),
    ).resolves.toEqual({
      from: "import ".length,
      options: [{ insertText: "value", label: "value" }],
      to: "import val".length,
    });
    const [, request] = fetchImplementation.mock.calls[0] ?? [];
    expect(fetchImplementation).toHaveBeenCalledWith(
      "/api/v2/project/target/completions",
      expect.objectContaining({ method: "POST" }),
    );
    expect(JSON.parse(String(request?.body))).toEqual({
      code: text,
      cursorOffsetUtf16: "import val".length,
      projectId: "project:fixture",
      protectedBodyRange: {
        end: generatedRegion.to,
        start: generatedRegion.from,
      },
    });
  });

  it("maps suffix-local identifiers in the full document", async () => {
    const fetchImplementation = vi.fn().mockResolvedValue(
      createJsonResponse({
        items: [{ insertText: "SettaState", label: "SettaState" }],
      }),
    );
    const provider = createPythonTargetCompletionProvider({
      fetchImplementation: fetchImplementation as typeof fetch,
      onFailure: vi.fn(),
      onSuccess: vi.fn(),
      projectId: "project:fixture",
    });

    await expect(
      provider({
        cursorOffsetUtf16: text.length,
        generatedRegion,
        language: "python",
        sectionId: "python-canvas:generated-python",
        signal: new AbortController().signal,
        text,
        trigger: "explicit",
      }),
    ).resolves.toEqual({
      from: text.length - "SettaSta".length,
      options: [{ insertText: "SettaState", label: "SettaState" }],
      to: text.length,
    });
  });

  it("does not query inside or on either edge of the protected body", async () => {
    const fetchImplementation = vi.fn();
    const provider = createPythonTargetCompletionProvider({
      fetchImplementation: fetchImplementation as typeof fetch,
      onFailure: vi.fn(),
      onSuccess: vi.fn(),
      projectId: "project:fixture",
    });

    for (const cursorOffsetUtf16 of [
      generatedRegion.from,
      generatedRegion.from + 1,
      generatedRegion.to,
    ]) {
      await expect(
        provider({
          cursorOffsetUtf16,
          generatedRegion,
          language: "python",
          sectionId: "python-canvas:generated-python",
          signal: new AbortController().signal,
          text,
          trigger: "explicit",
        }),
      ).resolves.toBeNull();
    }
    expect(fetchImplementation).not.toHaveBeenCalled();
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
