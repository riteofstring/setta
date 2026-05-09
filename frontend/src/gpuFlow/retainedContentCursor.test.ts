import { describe, expect, it } from "vitest";

import type { GpuRetainedContentInteractionHit } from "./interactions/retainedContentInteraction";
import { resolveGpuRetainedContentHitCursor } from "./retainedContentCursor";
import {
  createGpuRetainedRowContentScene,
  type GpuRetainedContentControlDescriptor,
  type GpuRetainedContentHitRecord,
  type GpuRetainedContentRowInput,
} from "./retainedContentScene";

describe("retained content cursor resolution", () => {
  it("uses a text cursor for text-like retained controls", () => {
    expect(resolveGpuRetainedContentHitCursor(controlHit(textControl()))).toBe(
      "text",
    );
  });

  it("uses a pointer cursor for switch controls", () => {
    expect(
      resolveGpuRetainedContentHitCursor(controlHit(switchControl())),
    ).toBe("pointer");
  });

  it("uses a not-allowed cursor for disabled controls", () => {
    expect(
      resolveGpuRetainedContentHitCursor(
        controlHit(switchControl(), { disabled: true }),
      ),
    ).toBe("not-allowed");
  });

  it("uses a pointer cursor for password reveal subparts", () => {
    expect(
      resolveGpuRetainedContentHitCursor(
        controlHit(passwordControl(), undefined, {
          kind: "control-subpart",
          subpartKind: "password-reveal",
        }),
      ),
    ).toBe("pointer");
  });

  it("uses a pointer cursor for popup options", () => {
    expect(
      resolveGpuRetainedContentHitCursor(
        controlHit(dropdownControl(), undefined, {
          kind: "popup-option",
          optionIndex: 0,
          optionValue: "a",
        }),
      ),
    ).toBe("pointer");
  });

  it("leaves labels and rows to the surface cursor", () => {
    expect(
      resolveGpuRetainedContentHitCursor(
        controlHit(textControl(), undefined, { kind: "label" }),
      ),
    ).toBeNull();
    expect(
      resolveGpuRetainedContentHitCursor(
        controlHit(textControl(), undefined, { kind: "row" }),
      ),
    ).toBeNull();
  });
});

function controlHit(
  control: GpuRetainedContentControlDescriptor,
  state?: GpuRetainedContentRowInput["state"],
  hitRecord?: Pick<
    GpuRetainedContentHitRecord,
    "kind" | "optionIndex" | "optionValue" | "subpartKind"
  >,
): GpuRetainedContentInteractionHit {
  const row: GpuRetainedContentRowInput = {
    control,
    controlKind: control.kind,
    depth: 0,
    id: "param-a",
    label: "Param A",
    ...(state ? { state } : {}),
  };
  const retainedScene = createGpuRetainedRowContentScene({
    controlWidth: 56,
    id: "params",
    ownerSectionId: "section-a",
    rowHeight: 28,
    rows: [row],
    scrollOffset: { x: 0, y: 0 },
    viewportRect: { height: 28, width: 160, x: 0, y: 0 },
  });
  const hit = createHitRecord(hitRecord);
  return {
    flowPoint: { x: 140, y: 14 },
    hit,
    localPoint: { x: 140, y: 14 },
    ownerSectionId: "section-a",
    retainedScene,
    screenPoint: { x: 140, y: 14 },
    surfaceId: "params",
    zIndex: 1,
  };
}

function createHitRecord(
  input:
    | Pick<
        GpuRetainedContentHitRecord,
        "kind" | "optionIndex" | "optionValue" | "subpartKind"
      >
    | undefined,
): GpuRetainedContentHitRecord {
  return {
    id: `${input?.kind ?? "control"}:param-a`,
    kind: input?.kind ?? "control",
    ownerRowId: "param-a",
    rect: { height: 20, width: 56, x: 104, y: 4 },
    ...(input?.optionIndex !== undefined
      ? { optionIndex: input.optionIndex }
      : {}),
    ...(input?.optionValue !== undefined
      ? { optionValue: input.optionValue }
      : {}),
    ...(input?.subpartKind !== undefined
      ? { subpartKind: input.subpartKind }
      : {}),
  };
}

function textControl(): GpuRetainedContentControlDescriptor {
  return {
    commitPolicy: "native-island",
    defaultDisplayValue: "",
    displayValue: "abc",
    editorKind: "text",
    kind: "text-like",
    rendererFamily: "text-like",
  };
}

function switchControl(): GpuRetainedContentControlDescriptor {
  return {
    checked: false,
    commitPolicy: "immediate",
    defaultDisplayValue: "",
    displayValue: "false",
    kind: "switch",
    rendererFamily: "switch",
  };
}

function passwordControl(): GpuRetainedContentControlDescriptor {
  return {
    commitPolicy: "native-island",
    defaultDisplayValue: "",
    displayValue: "",
    hasSecret: true,
    kind: "password",
    placeholder: "",
    rendererFamily: "password",
    revealAvailable: true,
    revealPending: false,
    revealedValue: null,
  };
}

function dropdownControl(): GpuRetainedContentControlDescriptor {
  return {
    choices: [{ label: "A", value: "a" }],
    commitPolicy: "immediate",
    defaultDisplayValue: "",
    displayValue: "A",
    kind: "dropdown",
    rendererFamily: "dropdown",
    selectedIndex: 0,
  };
}
