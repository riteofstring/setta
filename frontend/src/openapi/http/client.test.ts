import { describe, expect, it } from "vitest";
import { rebuildBackendRequest } from "./client";

describe("rebuildBackendRequest", () => {
  it("preserves POST metadata and body while rewriting the URL", async () => {
    const original = new Request("http://127.0.0.1:3000/loadProjectConfig", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        "X-Test": "1",
      },
      body: JSON.stringify({ projectConfigName: "sample_project" }),
    });

    const rebuilt = await rebuildBackendRequest(
      original,
      "http://127.0.0.1:8000/api/loadProjectConfig",
    );

    expect(rebuilt.url).toBe("http://127.0.0.1:8000/api/loadProjectConfig");
    expect(rebuilt.method).toBe("POST");
    expect(rebuilt.credentials).toBe("include");
    expect(rebuilt.headers.get("Content-Type")).toBe("application/json");
    expect(rebuilt.headers.get("X-Test")).toBe("1");
    await expect(rebuilt.text()).resolves.toBe(
      '{"projectConfigName":"sample_project"}',
    );
  });

  it("rewrites GET requests without adding a body", async () => {
    const original = new Request("http://127.0.0.1:3000/serverMode", {
      method: "GET",
      credentials: "include",
      headers: {
        Accept: "application/json",
      },
    });

    const rebuilt = await rebuildBackendRequest(
      original,
      "http://127.0.0.1:8000/api/serverMode",
    );

    expect(rebuilt.url).toBe("http://127.0.0.1:8000/api/serverMode");
    expect(rebuilt.method).toBe("GET");
    expect(rebuilt.credentials).toBe("include");
    expect(rebuilt.headers.get("Accept")).toBe("application/json");
    expect(rebuilt.body).toBeNull();
  });
});
