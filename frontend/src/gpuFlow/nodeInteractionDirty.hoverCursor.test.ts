/* @vitest-environment jsdom */

import { describe, expect, it, vi } from "vitest";
import { createGpuNodeInteractionDirtyController } from "./nodeInteractionDirty";
import {
  createInteractionTextureManager,
  createPointerEvent,
} from "./nodeInteractionDirty.testHelpers";

describe("gpu node hover cursor dirty tracking", () => {
  it("restores canvas hover cursor on pointer release after capture leave clears it", () => {
    const canvas = document.createElement("div");
    document.body.append(canvas);
    const textureManager = createInteractionTextureManager();
    const resolveCanvasCursor = vi.fn(() => "pointer");
    const controller = createGpuNodeInteractionDirtyController({
      elementByNodeId: () => new Map(),
      getFrame: () => 1,
      requestFrame: vi.fn(),
      resolveCanvasCursor,
      textureManager: () => textureManager,
    });
    const detach = controller.attach(canvas, document);

    canvas.dispatchEvent(
      createPointerEvent("pointermove", {
        buttons: 0,
        clientX: 80,
        clientY: 80,
        pointerId: 3,
      }),
    );
    expect(canvas.style.cursor).toBe("pointer");

    canvas.dispatchEvent(
      createPointerEvent("pointerleave", {
        buttons: 0,
        clientX: 80,
        clientY: 80,
        pointerId: 3,
      }),
    );
    expect(canvas.style.cursor).toBe("");

    canvas.dispatchEvent(
      createPointerEvent("pointerup", {
        buttons: 0,
        clientX: 80,
        clientY: 80,
        pointerId: 3,
      }),
    );
    expect(canvas.style.cursor).toBe("pointer");

    detach();
    canvas.remove();
  });
});
