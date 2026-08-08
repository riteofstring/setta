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

const interactionInputs = ["pointer", "touch", "keyboard"] satisfies InteractionInput[];
const ownerCases: readonly {
  expected: ReturnType<typeof resolveStartOwner>;
  label: string;
  overrides: Partial<InteractionStart>;
}[] = [
  { expected: "viewport", label: "canvas", overrides: { surface: "canvas" } },
  {
    expected: "root-layout",
    label: "sorting root handle",
    overrides: { surface: "root-section-handle" },
  },
  {
    expected: "section-structure",
    label: "free-move root handle",
    overrides: { sectionMode: "free", surface: "root-section-handle" },
  },
  {
    expected: "section-structure",
    label: "nested handle",
    overrides: { surface: "nested-section-handle" },
  },
  { expected: "item-tree", label: "item handle", overrides: { surface: "item-handle" } },
  { expected: null, label: "host content", overrides: { surface: "host-content" } },
  {
    expected: "viewport",
    label: "viewport override",
    overrides: { surface: "root-section-handle", viewportOverride: true },
  },
];

const ownerInputCases = ownerCases.flatMap((ownerCase) =>
  interactionInputs.map((input) => ({ ...ownerCase, input })),
);

describe("Phase 0 interaction-owner characterization", () => {
  it("records the source surfaces behind the ownership matrix", () => {
    expect(INTERACTION_FIXTURE_EVIDENCE.ownership.sources).toEqual(
      expect.arrayContaining([
        "frontend/src/forks/dnd-kit/useDropType.ts",
        "frontend/src/forks/xyflow/core/container/ZoomPane.tsx",
      ]),
    );
  });

  it.each(ownerInputCases)(
    "assigns exactly $expected for $input activation on $label",
    ({ expected, input, overrides }) => {
      expect(resolveStartOwner(request({ ...overrides, input }))).toBe(expected);
    },
  );

  it.each(interactionInputs)(
    "disables competing %s activators when the owning capability is unavailable",
    (input) => {
      expect(
        resolveStartOwner(request({ input, layoutEnabled: false, surface: "root-section-handle" })),
      ).toBeNull();
      expect(
        resolveStartOwner(
          request({ input, structureEnabled: false, surface: "nested-section-handle" }),
        ),
      ).toBeNull();
      expect(
        resolveStartOwner(request({ input, itemMovementEnabled: false, surface: "item-handle" })),
      ).toBeNull();
    },
  );

  it.each(interactionInputs)(
    "retains one %s owner through runtime mode changes and clears it on cancellation",
    (input) => {
      const active = transitionInteractionOwnership(IDLE_INTERACTION_OWNERSHIP, {
        type: "start",
        request: request({ input, surface: "root-section-handle" }),
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
    },
  );

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
