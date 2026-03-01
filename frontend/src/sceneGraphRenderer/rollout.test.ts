import { describe, expect, it } from "vitest";
import type { SceneGraphRendererFlags } from "./flags";
import {
  isSceneGraphRendererDefaultOnSurface,
  resolveSceneGraphRendererRolloutDefaultOnReason,
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

  it("marks chief_quick as a default-on non-settings project", () => {
    // Phase 6 expansion promotes chief_quick from canary to default-on rollout.
    expect(
      isSceneGraphRendererDefaultOnSurface(
        createSurface({
          projectConfigId: "chief-quick-config-id",
          projectConfigName: "chief_quick",
          activeViewModeName: "Overview",
        }),
      ),
    ).toBe(true);
  });

  it("marks small_shell as a default-on non-settings project", () => {
    // Phase 6 expansion promotes small_shell from canary to default-on rollout.
    expect(
      isSceneGraphRendererDefaultOnSurface(
        createSurface({
          projectConfigId: "small-shell-config-id",
          projectConfigName: "small_shell",
          activeViewModeName: "Overview",
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
          projectConfigName: "project_name_canary_target",
          activeViewModeName: "Overview",
        }),
        [],
        ["project_name_canary_target"],
      ),
    ).toBe(true);
  });

  it("reports settings project rollout reason as project-name default", () => {
    expect(
      resolveSceneGraphRendererRolloutDefaultOnReason(
        createSurface({
          projectConfigId: "settings-config-id",
          projectConfigName: "settings",
          activeViewModeName: "Core",
        }),
      ),
    ).toBe("project_config_name_default");
  });

  it("reports chief_quick rollout reason as project-name default", () => {
    expect(
      resolveSceneGraphRendererRolloutDefaultOnReason(
        createSurface({
          projectConfigId: "chief-quick-config-id",
          projectConfigName: "chief_quick",
          activeViewModeName: "Overview",
        }),
      ),
    ).toBe("project_config_name_default");
  });

  it("reports small_shell rollout reason as project-name default", () => {
    expect(
      resolveSceneGraphRendererRolloutDefaultOnReason(
        createSurface({
          projectConfigId: "small-shell-config-id",
          projectConfigName: "small_shell",
          activeViewModeName: "Overview",
        }),
      ),
    ).toBe("project_config_name_default");
  });

  it("reports canary rollout reasons for project id and project name", () => {
    expect(
      resolveSceneGraphRendererRolloutDefaultOnReason(
        createSurface({
          projectConfigId: "canary-project-config-id",
          projectConfigName: "home",
          activeViewModeName: "Overview",
        }),
        ["canary-project-config-id"],
      ),
    ).toBe("project_config_id_canary");
    expect(
      resolveSceneGraphRendererRolloutDefaultOnReason(
        createSurface({
          projectConfigId: "other-project-config-id",
          projectConfigName: "project_name_canary_target",
          activeViewModeName: "Overview",
        }),
        [],
        ["project_name_canary_target"],
      ),
    ).toBe("project_config_name_canary");
  });

  it("reports none when a surface is outside rollout targets", () => {
    expect(
      resolveSceneGraphRendererRolloutDefaultOnReason(
        createSurface({
          projectConfigId: "non-target-config-id",
          projectConfigName: "home",
          activeViewModeName: "Overview",
        }),
      ),
    ).toBe("none");
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
        projectConfigName: "project_name_canary_target",
        activeViewModeName: "Overview",
      }),
      hasEnabledStorageOverride: false,
      rolloutProjectConfigIds: [],
      rolloutProjectConfigNames: ["project_name_canary_target"],
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
      rolloutProjectConfigNames: ["project_name_canary_target"],
    });

    expect(effectiveFlags.enabled).toBe(false);
  });
});
