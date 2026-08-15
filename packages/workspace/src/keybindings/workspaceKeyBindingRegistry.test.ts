/* @vitest-environment jsdom */

import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getResolvedWorkspaceKeyBindings,
  getWorkspaceKeyBindingConflicts,
  getWorkspaceKeyBindings,
  registerWorkspaceKeyBindings,
} from "./workspaceKeyBindingRegistry";

// jsdom reports no Mac user agent; the label case flips this to read the macOS chord text.
let mockIsMacOs = false;
vi.mock("../canvas/utils", async (importOriginal) => {
  const original = await importOriginal<typeof import("../canvas/utils")>();
  return { ...original, isMacOs: () => mockIsMacOs };
});

function getBinding(id: string) {
  const binding = getWorkspaceKeyBindings().find((candidate) => candidate.id === id);
  if (!binding) {
    throw new Error(`Missing workspace key binding ${id}.`);
  }
  return binding;
}

describe("workspace key bindings", () => {
  afterEach(() => {
    mockIsMacOs = false;
    registerWorkspaceKeyBindings([]);
  });

  it("ships the reference's chords and takes each command's own label", () => {
    expect(getBinding("workspace.group-sections")).toMatchObject({
      chord: "Mod + G",
      chordLabel: "Ctrl + G",
      label: "Group",
      origin: "default",
    });
    expect(getBinding("workspace.ungroup-sections").chord).toBe("Shift + Mod + G");
    expect(getBinding("workspace.delete-sections").chord).toBe("Backspace");
    expect(getBinding("workspace.move-items-up").chord).toBe("Alt + ArrowUp");
    expect(getBinding("workspace.indent-items").chord).toBe("Tab");
    expect(getBinding("workspace.unindent-items").chord).toBe("Shift + Tab");
    expect(getBinding("workspace.select-all").chord).toBe("Mod + A");
    expect(getBinding("workspace.select-top-level-sections").chord).toBe("Mod + Shift + A");
    expect(getBinding("workspace.fit-view")).toMatchObject({ chord: "F", label: "Fit view" });
    expect(getBinding("workspace.zoom-in").chord).toBe("Equal");
    expect(getBinding("workspace.zoom-out").chord).toBe("Minus");
    expect(getBinding("workspace.reset-zoom").chord).toBe("Mod + Comma");
    expect(getBinding("workspace.zoom-to-pointer").chord).toBe("Z");
  });

  it("offers locking as a bindable operation the reference gives no chord", () => {
    expect(getBinding("workspace.lock-sections")).toMatchObject({
      chord: null,
      chordLabel: null,
      label: "Lock Position & Size",
    });
    expect(getBinding("workspace.unlock-sections").chord).toBeNull();
  });

  it("writes the chord label for the platform it is read on", () => {
    mockIsMacOs = true;
    expect(getBinding("workspace.ungroup-sections").chordLabel).toBe("⌘ + Shift + G");
  });

  it("ships no conflicting default chords", () => {
    expect(getWorkspaceKeyBindingConflicts([])).toEqual([]);
  });

  it("replaces the complete host set and leaves unnamed bindings on their defaults", () => {
    registerWorkspaceKeyBindings([{ id: "workspace.lock-sections", chord: "Mod + Alt + L" }]);
    expect(getBinding("workspace.lock-sections")).toMatchObject({
      chord: "Mod + Alt + L",
      origin: "host",
    });
    expect(getBinding("workspace.group-sections").origin).toBe("default");

    registerWorkspaceKeyBindings([]);
    expect(getBinding("workspace.lock-sections").chord).toBeNull();
  });

  it("unbinds an operation the host wants the chord back from", () => {
    registerWorkspaceKeyBindings([{ id: "workspace.delete-sections", chord: null }]);
    expect(getBinding("workspace.delete-sections")).toMatchObject({ chord: null, origin: "host" });
    expect(
      getResolvedWorkspaceKeyBindings(false).some(
        (binding) => binding.definition.id === "workspace.delete-sections",
      ),
    ).toBe(false);
  });

  it("fails registration for an unknown operation, a repeated binding, or an unusable chord", () => {
    expect(() =>
      registerWorkspaceKeyBindings([{ id: "workspace.run-code", chord: "Mod + Enter" }]),
    ).toThrow(/is not a workspace operation/u);
    expect(() =>
      registerWorkspaceKeyBindings([
        { id: "workspace.lock-sections", chord: "Mod + Alt + L" },
        { id: "workspace.lock-sections", chord: "Mod + Alt + K" },
      ]),
    ).toThrow(/bound twice/u);
    expect(() =>
      registerWorkspaceKeyBindings([{ id: "workspace.lock-sections", chord: "Mod + Grab" }]),
    ).toThrow(/unknown key grab/u);
  });

  it("reports the bindings that would share a chord before it is registered", () => {
    const candidate = [{ id: "workspace.lock-sections", chord: "Mod + G" }];
    expect(getWorkspaceKeyBindingConflicts(candidate)).toEqual([
      {
        chord: "Mod + G",
        chordLabel: "Ctrl + G",
        bindingIds: ["workspace.group-sections", "workspace.lock-sections"],
        reservedGesture: null,
      },
    ]);
    expect(() => registerWorkspaceKeyBindings(candidate)).toThrow(
      /Ctrl \+ G is claimed by workspace.group-sections, workspace.lock-sections/u,
    );
    expect(getBinding("workspace.lock-sections").chord).toBeNull();
  });

  it("refuses a chord a held interaction gesture already owns", () => {
    const candidate = [{ id: "workspace.lock-sections", chord: "Mod + Shift" }];
    expect(getWorkspaceKeyBindingConflicts(candidate)).toEqual([
      {
        chord: "Mod + Shift",
        chordLabel: "Ctrl + Shift",
        bindingIds: ["workspace.lock-sections"],
        reservedGesture: "parameter selection",
      },
    ]);
    expect(() => registerWorkspaceKeyBindings(candidate)).toThrow(
      /reserved for parameter selection/u,
    );
  });

  it("frees a default chord once the host moves the operation off it", () => {
    registerWorkspaceKeyBindings([
      { id: "workspace.group-sections", chord: "Mod + Alt + G" },
      { id: "workspace.lock-sections", chord: "Mod + G" },
    ]);
    expect(getBinding("workspace.group-sections").chord).toBe("Mod + Alt + G");
    expect(getBinding("workspace.lock-sections").chord).toBe("Mod + G");
  });

  it("resolves the chord rules for the platform it dispatches on", () => {
    const macOS = getResolvedWorkspaceKeyBindings(true);
    const other = getResolvedWorkspaceKeyBindings(false);
    const macMoveUp = macOS.find((binding) => binding.definition.id === "workspace.move-items-up");
    const deleteSections = other.find(
      (binding) => binding.definition.id === "workspace.delete-sections",
    );
    // "Alt + ArrowUp" is not a native editing chord on either platform, and its browser default
    // is the binding's to take; "Backspace" is bare, so it stands down inside editors.
    expect(macMoveUp).toMatchObject({
      suppressesBrowserDefault: true,
      yieldsToEditableTarget: false,
    });
    expect(deleteSections).toMatchObject({
      suppressesBrowserDefault: false,
      yieldsToEditableTarget: true,
    });
  });

  // Select-all is the browser's and the caret's chord before it is the workspace's; adding Shift
  // takes it back, which is what the reference's rules say about both chords.
  it("hands Mod+A to a caret but keeps Mod+Shift+A on every platform", () => {
    for (const macOS of [true, false]) {
      const resolved = getResolvedWorkspaceKeyBindings(macOS);
      expect(
        resolved.find((binding) => binding.definition.id === "workspace.select-all"),
      ).toMatchObject({ suppressesBrowserDefault: true, yieldsToEditableTarget: true });
      expect(
        resolved.find((binding) => binding.definition.id === "workspace.select-top-level-sections"),
      ).toMatchObject({ suppressesBrowserDefault: true, yieldsToEditableTarget: false });
      expect(
        resolved.find((binding) => binding.definition.id === "workspace.fit-view"),
      ).toMatchObject({ suppressesBrowserDefault: false, yieldsToEditableTarget: true });
    }
  });
});
