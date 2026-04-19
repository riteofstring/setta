import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

describe("openapi http client transport", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    vi.resetModules();
    vi.doMock("utils/transportUrlCore", () => ({
      buildBackendURL: (path: string) => `http://backend.test${path}`,
    }));
    vi.doMock("utils/shareSessionHeaders", () => ({
      buildShareSessionHeaders: () => ({
        "X-Share-Session-Id": "share-session-1",
      }),
    }));
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValue(
      new Response("{}", {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
  });

  afterEach(() => {
    fetchMock.mockReset();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("rewrites POST request URLs without dropping the serialized body", async () => {
    await import("./client");
    const { client } = await import("./generated/client.gen");
    const configuredFetch = client.getConfig().fetch;

    expect(configuredFetch).toBeTypeOf("function");
    if (!configuredFetch) {
      throw new Error("Expected OpenAPI fetch transport to be configured.");
    }

    await configuredFetch(
      new Request("http://frontend.test/api/loadProjectConfig", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ projectConfigName: "round_lime" }),
      }),
    );

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const forwardedRequest = fetchMock.mock.calls[0]?.[0];
    expect(forwardedRequest).toBeInstanceOf(Request);

    const request = forwardedRequest as Request;
    expect(request.url).toBe("http://backend.test/api/loadProjectConfig");
    expect(request.method).toBe("POST");
    expect(request.headers.get("Content-Type")).toBe("application/json");
    expect(request.headers.get("X-Share-Session-Id")).toBe("share-session-1");
    expect(await request.text()).toBe(
      JSON.stringify({ projectConfigName: "round_lime" }),
    );
  });
});
