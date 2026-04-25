import { describe, expect, it, vi } from "vitest";

describe("appSubsystemFrontendSdk OpenAPI configuration", () => {
  it("does not configure the shared generated client from the SDK root import", async () => {
    vi.resetModules();
    const { client } = await import("openapi/http/generated/client.gen");
    const hostFetch = vi.fn();
    client.setConfig({
      baseUrl: "http://host-openapi-owner",
      credentials: "same-origin",
      responseStyle: "fields",
      fetch: hostFetch,
    });

    await import("@setta/app-subsystem-frontend-sdk");

    const config = client.getConfig();
    expect(config.baseUrl).toBe("http://host-openapi-owner");
    expect(config.credentials).toBe("same-origin");
    expect(config.fetch).toBe(hostFetch);
  });

  it("configures plugin OpenAPI only through the explicit initializer", async () => {
    vi.resetModules();
    const { client } = await import("openapi/http/generated/client.gen");
    const { configureAppSubsystemOpenAPI } = await import(
      "@setta/app-subsystem-frontend-sdk"
    );
    client.setConfig({
      baseUrl: "http://host-openapi-owner",
      fetch: vi.fn(),
    });

    configureAppSubsystemOpenAPI();

    const config = client.getConfig();
    expect(config.baseUrl).not.toBe("http://host-openapi-owner");
    expect(config.credentials).toBe("include");
    expect(config.responseStyle).toBe("fields");
    expect(config.fetch).toBeTypeOf("function");
  });
});
