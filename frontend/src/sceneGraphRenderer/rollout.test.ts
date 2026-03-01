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
  it("keeps the settings project default-off across view modes", () => {
    // Settings now stays DOM-first unless the renderer is explicitly allowlisted/overridden.
    expect(
      isSceneGraphRendererDefaultOnSurface(
        createSurface({
          projectConfigId: "settings-config-id",
          projectConfigName: "settings",
          activeViewModeName: "All Settings",
        }),
      ),
    ).toBe(false);
    expect(
      isSceneGraphRendererDefaultOnSurface(
        createSurface({
          projectConfigId: "settings-config-id",
          projectConfigName: "settings",
          activeViewModeName: "Core",
        }),
      ),
    ).toBe(false);
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

  it("reports none for settings project rollout reason without allowlists", () => {
    expect(
      resolveSceneGraphRendererRolloutDefaultOnReason(
        createSurface({
          projectConfigId: "settings-config-id",
          projectConfigName: "settings",
          activeViewModeName: "Core",
        }),
      ),
    ).toBe("none");
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
          projectConfigName: "chief_quick",
          activeViewModeName: "Overview",
        }),
        [],
        ["chief_quick"],
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

  it("keeps renderer disabled when no explicit enabled override exists", () => {
    // Without rollout targets, missing localStorage overrides must stay disabled.
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

    expect(effectiveFlags).toEqual(
      createFlags({ enabled: false, backend: "auto" }),
    );
  });

  it("default-enables settings only when explicitly canary-allowlisted by name", () => {
    // Settings can still be targeted intentionally through rolloutProjectConfigNames.
    const effectiveFlags = resolveSceneGraphRendererRolloutFlags({
      persistedFlags: createFlags({ enabled: false, backend: "auto" }),
      surface: createSurface({
        projectConfigId: "settings-config-id",
        projectConfigName: "settings",
        activeViewModeName: "Core",
      }),
      hasEnabledStorageOverride: false,
      rolloutProjectConfigIds: [],
      rolloutProjectConfigNames: ["settings"],
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
