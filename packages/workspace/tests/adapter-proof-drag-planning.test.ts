import { describe, expect, it } from "vitest";

import {
  ADAPTER_PROOF_CANVAS_TARGET_ID,
  adapterProofOrientation,
  adapterProofSelectionBounds,
  createInteractionRect,
  EMPTY_COLLISION_TRACKER_STATE,
  INITIAL_ADAPTER_PROOF_HIERARCHY,
  resolveAdapterProofDragPreview,
  type AdapterProofDragSession,
  type InteractionRect,
} from "../src/testing.js";

const sectionIds = ["nested-note-a", "nested-container"];

function rects(zoom: number): {
  client: Readonly<Record<string, InteractionRect>>;
  workspace: Readonly<Record<string, InteractionRect>>;
} {
  const workspace = {
    "nested-note-a": createInteractionRect(70, 120, 280, 80),
    "nested-container": createInteractionRect(70, 212, 280, 150),
    "nested-note-d": createInteractionRect(70, 374, 280, 80),
  };
  const client = Object.fromEntries(
    Object.entries(workspace).map(([sectionId, rect]) => [
      sectionId,
      createInteractionRect(
        30 + rect.x * zoom,
        20 + rect.y * zoom,
        rect.width * zoom,
        rect.height * zoom,
      ),
    ]),
  );
  return { client, workspace };
}

function session(zoom: number, mode: "free" | "sort"): AdapterProofDragSession {
  const measured = rects(zoom);
  const sourceClientBounds = adapterProofSelectionBounds(sectionIds, measured.client);
  const sourceWorkspaceBounds = adapterProofSelectionBounds(sectionIds, measured.workspace);
  if (!sourceClientBounds || !sourceWorkspaceBounds) {
    throw new Error("The adapter-proof block fixture must have complete geometry.");
  }
  return {
    activatorPoint: {
      x: sourceClientBounds.x + sourceClientBounds.width / 2,
      y: sourceClientBounds.y + 20,
    },
    clientRectsById: measured.client,
    collisionState: EMPTY_COLLISION_TRACKER_STATE,
    hierarchy: INITIAL_ADAPTER_PROOF_HIERARCHY,
    mode,
    sectionIds,
    sourceClientBounds,
    sourceWorkspaceBounds,
    workspaceRectsById: measured.workspace,
  };
}

describe("Phase 0 adapter selection-block drag planning", () => {
  it.each([0.5, 1, 2])("keeps canvas preview and commit geometry invariant at %sx zoom", (zoom) => {
    const resolution = resolveAdapterProofDragPreview({
      orientation: adapterProofOrientation,
      screenDelta: { x: 360 * zoom, y: 220 * zoom },
      session: session(zoom, "free"),
      targetId: ADAPTER_PROOF_CANVAS_TARGET_ID,
      zoom,
    });

    expect(resolution.reason).toBeNull();
    expect(resolution.preview).toMatchObject({
      destinationBounds: { x: 430, y: 340, width: 280, height: 242 },
      order: sectionIds,
      plan: {
        destinationParentId: null,
        mode: "free",
        sectionIds,
        topLevelPositions: {
          "nested-container": { x: 430, y: 432 },
          "nested-note-a": { x: 430, y: 340 },
        },
      },
      targetId: ADAPTER_PROOF_CANVAS_TARGET_ID,
    });
  });

  it("uses one collision boundary for a canonical sibling-block sorting preview", () => {
    const current = session(1, "sort");
    const target = current.clientRectsById["nested-note-d"];
    if (!target) {
      throw new Error("The sorting target must be measured.");
    }
    const resolution = resolveAdapterProofDragPreview({
      orientation: adapterProofOrientation,
      screenDelta: {
        x: 0,
        y: target.bottom - (current.activatorPoint?.y ?? 0) + 10,
      },
      session: current,
      targetId: "nested-note-d",
      zoom: 1,
    });

    expect(resolution.reason).toBeNull();
    expect(resolution.preview).toMatchObject({
      order: ["nested-note-d", "nested-note-a", "nested-container"],
      plan: {
        destinationIndex: 1,
        destinationParentId: "root-alpha",
        mode: "sort",
        sectionIds,
      },
      targetId: "nested-note-d",
    });
  });

  it("rejects a canvas target when the active session started in sorting mode", () => {
    const resolution = resolveAdapterProofDragPreview({
      orientation: adapterProofOrientation,
      screenDelta: { x: 300, y: 200 },
      session: session(1, "sort"),
      targetId: ADAPTER_PROOF_CANVAS_TARGET_ID,
      zoom: 1,
    });

    expect(resolution.preview).toBeNull();
    expect(resolution.reason).toBe("The package move plan rejected this target.");
  });
});
