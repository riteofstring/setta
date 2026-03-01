import { describe, expect, it } from "vitest";
import type { SceneGraphRendererFlags } from "./flags";
import {
  isSceneGraphRendererDefaultOnSurface,
  resolveSceneGraphRendererRolloutFlags,
  type SceneGraphRendererRolloutSurface,
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

function createSurface(
  overrides: Partial<SceneGraphRendererRolloutSurface> = {},
): SceneGraphRendererRolloutSurface {
  return {
    projectConfigId: "project-config-id",
    projectConfigName: "home",
    activeViewModeName: "Overview",
    ...overrides,
  };
}

describe("scene graph renderer rollout policy", () => {
  it("marks the settings project as default-on across view modes", () => {
    // Phase 6 expansion enables all settings tabs while keeping project scoping explicit.
    expect(
      isSceneGraphRendererDefaultOnSurface(
        createSurface({
          projectConfigId: "settings-config-id",
          projectConfigName: "settings",
          activeViewModeName: "All Settings",
        }),
      ),
    ).toBe(true);
    expect(
      isSceneGraphRendererDefaultOnSurface(
        createSurface({
          projectConfigId: "settings-config-id",
          projectConfigName: "settings",
          activeViewModeName: "Core",
        }),
      ),
    ).toBe(true);
  });

  it("enables allowlisted non-settings project config ids", () => {
    // Canary expansion must rely on explicit projectConfigId allowlist entries.
    expect(
      isSceneGraphRendererDefaultOnSurface(
        createSurface({
          projectConfigId: "canary-project-config-id",
          projectConfigName: "home",
          activeViewModeName: "Overview",
        }),
        ["canary-project-config-id"],
      ),
    ).toBe(true);
  });

  it("enables allowlisted non-settings project config names", () => {
    // Project-class rollout canary can target exact project config names.
    expect(
      isSceneGraphRendererDefaultOnSurface(
        createSurface({
          projectConfigId: "other-project-config-id",
          projectConfigName: "chief_quick",
          activeViewModeName: "Overview",
        }),
        [],
        ["chief_quick"],
      ),
    ).toBe(true);
  });

  it("does not default-enable unrelated surfaces", () => {
    // Controlled rollout must not leak to non-target project IDs or names.
    const effectiveFlags = resolveSceneGraphRendererRolloutFlags({
      persistedFlags: createFlags({ enabled: false }),
      surface: createSurface({
        projectConfigId: "non-target-config-id",
        projectConfigName: "home",
        activeViewModeName: "Overview",
      }),
      hasEnabledStorageOverride: false,
      rolloutProjectConfigIds: [],
      rolloutProjectConfigNames: [],
    });

    expect(effectiveFlags.enabled).toBe(false);
  });

  it("default-enables renderer when no explicit enabled override exists", () => {
    // Missing localStorage override should inherit rollout defaults for targeted settings surfaces.
    const effectiveFlags = resolveSceneGraphRendererRolloutFlags({
      persistedFlags: createFlags({ enabled: false, backend: "auto" }),
      surface: createSurface({
        projectConfigId: "settings-config-id",
        projectConfigName: "settings",
        activeViewModeName: "All Settings",
      }),
      hasEnabledStorageOverride: false,
      rolloutProjectConfigIds: [],
      rolloutProjectConfigNames: [],
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
      surface: createSurface({
        projectConfigId: "settings-config-id",
        projectConfigName: "settings",
        activeViewModeName: "Core",
      }),
      hasEnabledStorageOverride: false,
      rolloutProjectConfigIds: [],
      rolloutProjectConfigNames: [],
    });

    expect(effectiveFlags.enabled).toBe(true);
  });

  it("default-enables allowlisted non-settings canary project", () => {
    // Explicit projectConfigId canary allowlist should unlock non-settings rollout.
    const effectiveFlags = resolveSceneGraphRendererRolloutFlags({
      persistedFlags: createFlags({ enabled: false, backend: "auto" }),
      surface: createSurface({
        projectConfigId: "canary-project-config-id",
        projectConfigName: "home",
        activeViewModeName: "Overview",
      }),
      hasEnabledStorageOverride: false,
      rolloutProjectConfigIds: ["canary-project-config-id"],
      rolloutProjectConfigNames: [],
    });

    expect(effectiveFlags.enabled).toBe(true);
  });

  it("default-enables allowlisted non-settings canary project names", () => {
    // Explicit projectConfigName canary allowlist should unlock non-settings rollout.
    const effectiveFlags = resolveSceneGraphRendererRolloutFlags({
      persistedFlags: createFlags({ enabled: false, backend: "auto" }),
      surface: createSurface({
        projectConfigId: "other-project-config-id",
        projectConfigName: "chief_quick",
        activeViewModeName: "Overview",
      }),
      hasEnabledStorageOverride: false,
      rolloutProjectConfigIds: [],
      rolloutProjectConfigNames: ["chief_quick"],
    });

    expect(effectiveFlags.enabled).toBe(true);
  });

  it("honors explicit enabled kill-switch overrides", () => {
    // Explicit localStorage override must remain the top-priority kill switch.
    const effectiveFlags = resolveSceneGraphRendererRolloutFlags({
      persistedFlags: createFlags({ enabled: false }),
      surface: createSurface({
        projectConfigId: "canary-project-config-id",
        projectConfigName: "settings",
        activeViewModeName: "All Settings",
      }),
      hasEnabledStorageOverride: true,
      rolloutProjectConfigIds: ["canary-project-config-id"],
      rolloutProjectConfigNames: ["chief_quick"],
    });

    expect(effectiveFlags.enabled).toBe(false);
  });
});
