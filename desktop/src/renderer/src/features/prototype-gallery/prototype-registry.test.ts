import { beforeEach, describe, expect, test } from "vitest";

import { useSettingsNavigationStore } from "../../stores/settings-navigation-store";
import {
  findPrototype,
  prototypeCategories,
  prototypes,
  prototypesForCategory,
} from "./prototype-registry";

beforeEach(() => {
  useSettingsNavigationStore.setState(useSettingsNavigationStore.getInitialState(), true);
});

describe("prototype registry", () => {
  test("defines the approved 4/6/4 concept set with unique identifiers", () => {
    expect(prototypes).toHaveLength(14);
    expect(prototypesForCategory("niri-background")).toHaveLength(4);
    expect(prototypesForCategory("agent-form")).toHaveLength(6);
    expect(prototypesForCategory("thinking-backdrop")).toHaveLength(4);
    expect(new Set(prototypes.map((prototype) => prototype.id)).size).toBe(prototypes.length);
    expect(prototypeCategories.map((category) => category.id)).toEqual([
      "niri-background",
      "agent-form",
      "thinking-backdrop",
    ]);
  });

  test("keeps renderer kinds aligned with their categories", () => {
    expect(
      prototypes.every((prototype) => {
        switch (prototype.category) {
          case "niri-background":
            return prototype.renderer.kind === "css";
          case "agent-form":
            return prototype.renderer.kind === "webgl2" && prototype.supportsAgentState;
          case "thinking-backdrop":
            return prototype.renderer.kind === "canvas2d";
        }
      }),
    ).toBe(true);
    expect(findPrototype("missing-prototype")).toBeNull();
  });
});

describe("prototype gallery navigation", () => {
  test("opens from Developer settings and returns without closing the utility shell", () => {
    const navigation = useSettingsNavigationStore.getState();
    navigation.openSettings({ subtab: "developer" });
    navigation.openPrototypeGallery();

    expect(useSettingsNavigationStore.getState().route).toEqual({ page: "prototype-gallery" });
    expect(useSettingsNavigationStore.getState().lastSubtab).toBe("developer");

    useSettingsNavigationStore.getState().returnToDeveloperSettings();

    expect(useSettingsNavigationStore.getState().route).toMatchObject({
      focusTarget: "prototype_gallery_launcher",
      page: "settings",
      subtab: "developer",
    });
  });

  test("closes the gallery to the workspace through the existing close action", () => {
    useSettingsNavigationStore.getState().openPrototypeGallery();
    useSettingsNavigationStore.getState().closeSettings();

    expect(useSettingsNavigationStore.getState().route).toEqual({ page: "workspace" });
  });
});
