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
  it("marks settings all-settings as a default-on rollout surface", () => {
    // Phase 6 starts by enabling auto backend on the heaviest settings surface.
    expect(
      isSceneGraphRendererDefaultOnSurface({
        projectConfigName: "settings",
        activeViewModeName: "All Settings",
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
