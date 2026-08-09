import { describe, expect, it } from "vitest";

import {
  IDLE_INTERACTION_ACTIVATION,
  itemTreeActivationEnabled,
  rootLayoutInteractionActive,
  sectionStructureActivationAllowed,
  WorkspaceInteractionActivationStore,
} from "../src/internal/workspace-interaction-activation.js";

const ACTIVE_SECTION_SNAPSHOT = {
  activeItemTreeId: null,
  activeSectionId: "note",
  activeSectionMode: "sort",
  owner: "section-structure",
  phase: "active",
} as const;

describe("workspace interaction activation store", () => {
  it("stages gating state ahead of the published subscriber snapshot", () => {
    const store = new WorkspaceInteractionActivationStore();
    let notifications = 0;
    store.subscribe(() => {
      notifications += 1;
    });

    store.stage(ACTIVE_SECTION_SNAPSHOT);

    expect(store.getGatingSnapshot()).toBe(ACTIVE_SECTION_SNAPSHOT);
    expect(store.getSnapshot()).toBe(IDLE_INTERACTION_ACTIVATION);
    expect(notifications).toBe(0);

    store.publishStaged();

    expect(store.getSnapshot()).toBe(ACTIVE_SECTION_SNAPSHOT);
    expect(notifications).toBe(1);

    store.publishStaged();
    expect(notifications).toBe(1);
  });

  it("publish immediately aligns gating and subscriber snapshots", () => {
    const store = new WorkspaceInteractionActivationStore();
    let notifications = 0;
    const unsubscribe = store.subscribe(() => {
      notifications += 1;
    });

    store.stage(ACTIVE_SECTION_SNAPSHOT);
    store.publish(IDLE_INTERACTION_ACTIVATION);

    expect(store.getGatingSnapshot()).toBe(IDLE_INTERACTION_ACTIVATION);
    expect(store.getSnapshot()).toBe(IDLE_INTERACTION_ACTIVATION);
    expect(notifications).toBe(1);

    unsubscribe();
    store.publish(ACTIVE_SECTION_SNAPSHOT);
    expect(notifications).toBe(1);
  });

  it("derives activation policy primitives from a snapshot", () => {
    expect(sectionStructureActivationAllowed(IDLE_INTERACTION_ACTIVATION)).toBe(true);
    expect(sectionStructureActivationAllowed(ACTIVE_SECTION_SNAPSHOT)).toBe(false);

    expect(itemTreeActivationEnabled(IDLE_INTERACTION_ACTIVATION)).toBe(true);
    expect(itemTreeActivationEnabled(ACTIVE_SECTION_SNAPSHOT)).toBe(false);
    expect(
      itemTreeActivationEnabled({
        ...ACTIVE_SECTION_SNAPSHOT,
        activeItemTreeId: "tree",
        activeSectionId: null,
        activeSectionMode: null,
        owner: "item-tree",
      }),
    ).toBe(true);

    expect(rootLayoutInteractionActive(ACTIVE_SECTION_SNAPSHOT)).toBe(false);
    expect(
      rootLayoutInteractionActive({
        ...IDLE_INTERACTION_ACTIVATION,
        owner: "root-layout",
        phase: "active",
      }),
    ).toBe(true);
  });
});
