import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getItemHandlerRegistration,
  registerItemHandlers,
} from "./itemHandlerRegistry";

describe("item handler registration", () => {
  afterEach(() => registerItemHandlers([]));

  it("replaces handlers keyed by section and stable item id", () => {
    const onAccepted = vi.fn();
    const onRejected = vi.fn();
    registerItemHandlers([
      {
        sectionId: "panel",
        itemId: "dropzone",
        kind: "dropzone",
        onAccepted,
        onRejected,
      },
      {
        sectionId: "panel",
        itemId: "password",
        kind: "password",
        onRevealSavedValue: vi.fn(),
      },
    ]);
    expect(getItemHandlerRegistration("panel", "dropzone")).toMatchObject({
      kind: "dropzone",
      onAccepted,
      onRejected,
    });
    expect(getItemHandlerRegistration("other-panel", "dropzone")).toBeNull();

    registerItemHandlers([]);
    expect(getItemHandlerRegistration("panel", "dropzone")).toBeNull();
  });

  it("rejects duplicate identities and malformed handlers", () => {
    const registration = {
      sectionId: "panel",
      itemId: "dropzone",
      kind: "dropzone" as const,
      onAccepted: vi.fn(),
      onRejected: vi.fn(),
    };
    expect(() =>
      registerItemHandlers([registration, registration]),
    ).toThrowError("Duplicate item handler registration for panel/dropzone.");
    expect(() =>
      registerItemHandlers([
        {
          ...registration,
          onAccepted: null,
        } as never,
      ]),
    ).toThrowError(
      "Item handler panel/dropzone onAccepted must be a function.",
    );
    expect(() => registerItemHandlers(null as never)).toThrowError(
      "Item handler registrations must be an array.",
    );
    expect(() =>
      registerItemHandlers([
        {
          sectionId: "panel",
          itemId: "dropzone",
          kind: "upload",
        } as never,
      ]),
    ).toThrowError(
      "Item handler panel/dropzone names the unknown handler kind upload.",
    );
  });
});
