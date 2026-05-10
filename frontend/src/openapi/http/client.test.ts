import { useServerMode } from "state/definitions";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createProjectConfig } from ".";

describe("OpenAPI HTTP client", () => {
  const env = import.meta.env as unknown as Record<string, unknown>;
  const previousDev = env["DEV"];
  const previousBackendOrigin = env["VITE_BACKEND_ORIGIN"];
  const originalFetch = globalThis.fetch;
  const originalRequest = globalThis.Request;

  beforeEach(() => {
    env["DEV"] = true;
    env["VITE_BACKEND_ORIGIN"] = "http://127.0.0.1:18123";
    useServerMode.setState({
      mode: "ide",
      modeResolved: true,
      modeError: null,
    });
  });

  afterEach(() => {
    env["DEV"] = previousDev;
    env["VITE_BACKEND_ORIGIN"] = previousBackendOrigin;
    globalThis.fetch = originalFetch;
    globalThis.Request = originalRequest;
    vi.restoreAllMocks();
  });

  it("rebuilds body requests with explicit init data before fetch", async () => {
    const NativeRequest = originalRequest;
    class GuardedRequest extends NativeRequest {
      constructor(input: RequestInfo | URL, init?: RequestInit) {
        if (init instanceof NativeRequest) {
          throw new Error("Request object must not be reused as RequestInit");
        }
        super(input, init);
      }
    }
    globalThis.Request = GuardedRequest as typeof Request;

    const payload = { previewImgColor: "#123456" };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const request = input as Request;

      expect(request.url).toBe(
        "http://127.0.0.1:18123/api/createProjectConfig",
      );
      expect(request.method).toBe("POST");
      expect(request.credentials).toBe("include");
      expect(request.headers.get("content-type")).toContain("application/json");
      expect(await request.json()).toEqual(payload);

      return new Response(JSON.stringify("created_project"), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    });
    globalThis.fetch = fetchMock as typeof fetch;

    const result = await createProjectConfig({ body: payload });

    expect(result.data).toBe("created_project");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
