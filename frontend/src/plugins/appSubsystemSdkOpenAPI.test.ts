import { describe, expect, it, vi } from "vitest";

describe("appSubsystemFrontendSdk OpenAPI configuration", () => {
  it("does not configure the shared generated client from the SDK root import", async () => {
    vi.resetModules();
    const { client: hostClient } = await import(
      "openapi/http/generated/client.gen"
    );
    const { client: sdkClient } = await import(
      "../../plugin-sdk/app-subsystem/src/openapi/http/generated/client.gen"
    );
    const hostFetch = vi.fn();
    hostClient.setConfig({
      baseUrl: "http://host-openapi-owner",
      credentials: "same-origin",
      responseStyle: "fields",
      fetch: hostFetch,
    });

    await import("@setta/app-subsystem-frontend-sdk");

    const hostConfig = hostClient.getConfig();
    expect(hostConfig.baseUrl).toBe("http://host-openapi-owner");
    expect(hostConfig.credentials).toBe("same-origin");
    expect(hostConfig.fetch).toBe(hostFetch);
    expect(sdkClient.getConfig().baseUrl).toBe("/api");
  });

  it("configures plugin OpenAPI only through the explicit initializer", async () => {
    vi.resetModules();
    const { client: hostClient } = await import(
      "openapi/http/generated/client.gen"
    );
    const { client: sdkClient } = await import(
      "../../plugin-sdk/app-subsystem/src/openapi/http/generated/client.gen"
    );
    const { configureAppSubsystemOpenAPI } = await import(
      "@setta/app-subsystem-frontend-sdk"
    );
    hostClient.setConfig({
      baseUrl: "http://host-openapi-owner",
      fetch: vi.fn(),
    });

    configureAppSubsystemOpenAPI();

    const hostConfig = hostClient.getConfig();
    expect(hostConfig.baseUrl).toBe("http://host-openapi-owner");

    const sdkConfig = sdkClient.getConfig();
    expect(sdkConfig.baseUrl).toBe("http://localhost");
    expect(sdkConfig.credentials).toBe("include");
    expect(sdkConfig.responseStyle).toBe("fields");
    expect(sdkConfig.fetch).toBeTypeOf("function");
  });
});
