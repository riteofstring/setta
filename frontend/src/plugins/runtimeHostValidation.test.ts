import { describe, expect, it } from "vitest";
import {
  ensureCapability,
  normalizePluginPath,
  validatePaneDefinition,
} from "./runtimeHostValidation";
import { PluginFrontendErrorCodeEnum } from "./runtimeValidation";

function expectPluginRuntimeCode(
  invoke: () => void,
  expectedCode: string,
): void {
  try {
    invoke();
    throw new Error("Expected plugin runtime validation to throw.");
  } catch (error) {
    expect(
      (
        error as {
          code?: string;
        }
      ).code,
    ).toBe(expectedCode);
  }
}

describe("runtimeHostValidation", () => {
  it("normalizes plugin API paths while preserving query strings", () => {
    // The plugin host prefixes these canonical paths onto the backend plugin route.
    expect(normalizePluginPath("health")).toBe("/health");
    expect(normalizePluginPath("//status?ok=1")).toBe("/status?ok=1");
    expect(normalizePluginPath("/nested/path/")).toBe("/nested/path/");
  });

  it("rejects traversal segments in plugin API paths", () => {
    // Plugins must not escape their namespaced backend route via relative traversal.
    expect(() => normalizePluginPath("/../../api/projects")).toThrow(
      "apiFetch path cannot include relative traversal segments",
    );
    expect(() => normalizePluginPath("/safe/%2E%2E%2Ffoo")).toThrow(
      "apiFetch path cannot include relative traversal segments",
    );
  });

  it("accepts supported pane icon names during registration validation", () => {
    // Pane registration should preserve the validated icon so overview tabs can render it.
    expect(
      validatePaneDefinition("acme.plugin", {
        id: "fixture-pane",
        title: "Fixture Pane",
        icon: "dashboard",
        renderer: {
          mount: () => undefined,
        },
      }),
    ).toMatchObject({
      pluginId: "acme.plugin",
      id: "fixture-pane",
      title: "Fixture Pane",
      icon: "dashboard",
    });
  });

  it("rejects missing capabilities before host operations run", () => {
    // Capability gating belongs to the validation owner so host APIs stay declarative.
    expectPluginRuntimeCode(
      () =>
        ensureCapability(
          "acme.plugin",
          new Set(["registerPane"]),
          "registerCommand",
          "registerCommand",
        ),
      PluginFrontendErrorCodeEnum.CapabilityDenied,
    );
  });
});
