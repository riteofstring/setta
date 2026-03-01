import { describe, expect, it } from "vitest";
import type { SceneGraphRendererFlags } from "./flags";
import {
  isSceneGraphRendererDefaultOnSurface,
  resolveSceneGraphRendererRolloutFlags,
} from "./rollout";

function createFlags(
  overrides: Partial<SceneGraphRendererFlags> = {},
): SceneGraphRendererFlags {
  return {
    enabled: false,
    backend: "auto",
    domIslandRadius: 2,
    debugOverlay: false,
    ...overrides,
  };
}

describe("scene graph renderer rollout policy", () => {
  it("marks the settings project as default-on across view modes", () => {
    // Phase 6 expansion enables all settings tabs while keeping project scoping explicit.
    expect(
      isSceneGraphRendererDefaultOnSurface({
        projectConfigName: "settings",
        activeViewModeName: "All Settings",
      }),
    ).toBe(true);
    expect(
      isSceneGraphRendererDefaultOnSurface({
        projectConfigName: "settings",
        activeViewModeName: "Core",
      }),
    ).toBe(true);
  });

  it("does not default-enable unrelated surfaces", () => {
    // Controlled rollout must not leak to other project/view combinations.
    const effectiveFlags = resolveSceneGraphRendererRolloutFlags({
      persistedFlags: createFlags({ enabled: false }),
      surface: {
        projectConfigName: "home",
        activeViewModeName: "Overview",
      },
      hasEnabledStorageOverride: false,
    });

    expect(effectiveFlags.enabled).toBe(false);
  });

  it("default-enables renderer when no explicit enabled override exists", () => {
    // Missing localStorage override should inherit rollout defaults for targeted surfaces.
    const effectiveFlags = resolveSceneGraphRendererRolloutFlags({
      persistedFlags: createFlags({ enabled: false, backend: "auto" }),
      surface: {
        projectConfigName: "settings",
        activeViewModeName: "All Settings",
      },
      hasEnabledStorageOverride: false,
    });

    expect(effectiveFlags).toEqual({
      enabled: true,
      backend: "auto",
      domIslandRadius: 2,
      debugOverlay: false,
    });
  });

  it("default-enables settings core when no explicit enabled override exists", () => {
    // Project-scoped rollout should apply to other settings tabs, not only All Settings.
    const effectiveFlags = resolveSceneGraphRendererRolloutFlags({
      persistedFlags: createFlags({ enabled: false, backend: "auto" }),
      surface: {
        projectConfigName: "settings",
        activeViewModeName: "Core",
      },
      hasEnabledStorageOverride: false,
    });

    expect(effectiveFlags.enabled).toBe(true);
  });

  it("honors explicit enabled kill-switch overrides", () => {
    // Explicit localStorage override must remain the top-priority kill switch.
    const effectiveFlags = resolveSceneGraphRendererRolloutFlags({
      persistedFlags: createFlags({ enabled: false }),
      surface: {
        projectConfigName: "settings",
        activeViewModeName: "All Settings",
      },
      hasEnabledStorageOverride: true,
    });

    expect(effectiveFlags.enabled).toBe(false);
  });
});
