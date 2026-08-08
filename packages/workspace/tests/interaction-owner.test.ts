import { describe, expect, it } from "vitest";

import {
  IDLE_INTERACTION_OWNERSHIP,
  resolveStartOwner,
  transitionInteractionOwnership,
  type InteractionInput,
  type InteractionStart,
} from "../src/testing.js";
import { INTERACTION_FIXTURE_EVIDENCE } from "./fixtures/interaction-evidence.js";

function request(overrides: Partial<InteractionStart> = {}): InteractionStart {
  return {
    input: "pointer",
    itemMovementEnabled: true,
    layoutEnabled: true,
    sectionMode: "sort",
    structureEnabled: true,
    surface: "canvas",
    viewportOverride: false,
    ...overrides,
  };
}

describe("Phase 0 interaction-owner characterization", () => {
  it("records the source surfaces behind the ownership matrix", () => {
    expect(INTERACTION_FIXTURE_EVIDENCE.ownership.sources).toEqual(
      expect.arrayContaining([
        "frontend/src/forks/dnd-kit/useDropType.ts",
        "frontend/src/forks/xyflow/core/container/ZoomPane.tsx",
      ]),
    );
  });

  it.each<{
    expected: ReturnType<typeof resolveStartOwner>;
    overrides: Partial<InteractionStart>;
  }>([
    { expected: "viewport", overrides: { surface: "canvas" } },
    { expected: "root-layout", overrides: { surface: "root-section-handle" } },
    {
      expected: "section-structure",
      overrides: { sectionMode: "free", surface: "root-section-handle" },
    },
    {
      expected: "section-structure",
      overrides: { surface: "nested-section-handle" },
    },
    { expected: "item-tree", overrides: { surface: "item-handle" } },
    { expected: null, overrides: { surface: "host-content" } },
    {
      expected: "viewport",
      overrides: { surface: "root-section-handle", viewportOverride: true },
    },
  ])("assigns exactly $expected for $overrides.surface", ({ expected, overrides }) => {
    expect(resolveStartOwner(request(overrides))).toBe(expected);
  });

  it.each<InteractionInput>(["pointer", "touch", "keyboard"])(
    "uses the same section-structure owner for %s activation",
    (input) => {
      expect(
        resolveStartOwner(
          request({ input, sectionMode: "free", surface: "nested-section-handle" }),
        ),
      ).toBe("section-structure");
    },
  );

  it("disables competing activators when the owning capability is unavailable", () => {
    expect(
      resolveStartOwner(request({ layoutEnabled: false, surface: "root-section-handle" })),
    ).toBeNull();
    expect(
      resolveStartOwner(request({ structureEnabled: false, surface: "nested-section-handle" })),
    ).toBeNull();
    expect(
      resolveStartOwner(request({ itemMovementEnabled: false, surface: "item-handle" })),
    ).toBeNull();
  });

  it("retains one owner through runtime mode changes and clears it on cancellation", () => {
    const active = transitionInteractionOwnership(IDLE_INTERACTION_OWNERSHIP, {
      type: "start",
      request: request({ surface: "root-section-handle" }),
    });
    const afterModeChange = transitionInteractionOwnership(active, {
      type: "mode-change",
      sectionMode: "free",
    });
    const cancelled = transitionInteractionOwnership(afterModeChange, {
      type: "cancel",
    });

    expect(active).toEqual({ owner: "root-layout", phase: "active" });
    expect(afterModeChange).toBe(active);
    expect(cancelled).toBe(IDLE_INTERACTION_OWNERSHIP);
  });

  it("rejects a second owner while a gesture is active and releases on completion", () => {
    const active = transitionInteractionOwnership(IDLE_INTERACTION_OWNERSHIP, {
      type: "start",
      request: request({ surface: "item-handle" }),
    });

    expect(() =>
      transitionInteractionOwnership(active, {
        type: "start",
        request: request({ surface: "canvas" }),
      }),
    ).toThrow('Interaction owner "item-tree" is already active.');
    expect(transitionInteractionOwnership(active, { type: "complete" })).toBe(
      IDLE_INTERACTION_OWNERSHIP,
    );
  });
});
