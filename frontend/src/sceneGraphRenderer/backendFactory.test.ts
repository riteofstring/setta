import { describe, expect, it } from "vitest";
import { createRendererBackend } from "./backendFactory";
import { DomBackendAdapter } from "./backends/DomBackendAdapter";
import { WebGlBackend } from "./backends/WebGlBackend";
import { WebGpuBackend } from "./backends/WebGpuBackend";

describe("createRendererBackend", () => {
  it("returns backend implementations for each negotiated backend id", () => {
    // Phase 1 backend negotiation should map deterministically to a backend class.
    expect(createRendererBackend("webgpu")).toBeInstanceOf(WebGpuBackend);
    expect(createRendererBackend("webgl")).toBeInstanceOf(WebGlBackend);
    expect(createRendererBackend("dom")).toBeInstanceOf(DomBackendAdapter);
  });
});
