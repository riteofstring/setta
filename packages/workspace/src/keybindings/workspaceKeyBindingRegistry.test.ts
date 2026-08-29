/* @vitest-environment jsdom */
import {
  afterEach as afterEachWorkspaceTestHost,
  beforeEach as beforeEachWorkspaceTestHost,
} from "vitest";
import {
  createWorkspaceTestHost,
  type WorkspaceTestHost,
} from "../../test/workspaceTestHost";

let testWorkspace: WorkspaceTestHost;
beforeEachWorkspaceTestHost(() => {
  testWorkspace = createWorkspaceTestHost();
});
afterEachWorkspaceTestHost(() => {
  testWorkspace.host.dispose();
});

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { registerWorkspaceCreationCommands } from "../context-menu/workspaceMenuRegistry";
import type { WorkspaceSectionInput } from "../document/types";
import { createWorkspaceHost, type WorkspaceHost } from "../workspaceHost";
import {
  getResolvedWorkspaceKeyBindings,
  getWorkspaceKeyBindingChordLabel,
  getWorkspaceKeyBindingConflicts,
  getWorkspaceKeyBindings,
  registerWorkspaceKeyBindings,
} from "./workspaceKeyBindingRegistry";

const creationSection: WorkspaceSectionInput = {
  id: "created",
  kind: "leaf",
  name: "Created",
  isMinimized: false,
  positionAndSizeLocked: false,
  isHorizontalOrientation: false,
  styleColor: null,
  overflowMode: false,
  tagColor: null,
  children: [],
};

let host: WorkspaceHost;

function registerCreationCommand(chord: string | null) {
  registerWorkspaceCreationCommands(host, [
    {
      id: "host-note",
      label: "Host note",
      group: "Host",
      chord,
      createSection: () => creationSection,
    },
  ]);
}

let mockIsMacOs = false;
vi.mock("../canvas/utils", async (importOriginal) => {
  const original = await importOriginal<typeof import("../canvas/utils")>();
  return { ...original, isMacOs: () => mockIsMacOs };
});

function getBinding(id: string) {
  const binding = getWorkspaceKeyBindings(host).find(
    (candidate) => candidate.id === id,
  );
  if (!binding) {
    throw new Error(`Missing workspace key binding ${id}.`);
  }
  return binding;
}

describe("workspace key bindings", () => {
  beforeEach(() => {
    host = createWorkspaceHost();
  });

  afterEach(() => {
    mockIsMacOs = false;
    host.dispose();
  });

  it("ships the reference's chords and takes each command's own label", () => {
    expect(getBinding("workspace.group-sections")).toMatchObject({
      chord: "Mod + G",
      chordLabel: "Ctrl + G",
      label: "Group",
      origin: "default",
    });
    expect(getBinding("workspace.ungroup-sections").chord).toBe(
      "Shift + Mod + G",
    );
    expect(getBinding("workspace.delete-sections").chord).toBe("Backspace");
    expect(getBinding("workspace.move-items-up").chord).toBe("Alt + ArrowUp");
    expect(getBinding("workspace.indent-items").chord).toBe("Tab");
    expect(getBinding("workspace.unindent-items").chord).toBe("Shift + Tab");
    expect(getBinding("workspace.focus-item-filter")).toMatchObject({
      chord: "Mod + K",
      chordLabel: "Ctrl + K",
      label: "Focus parameter filter",
    });
    expect(getBinding("workspace.select-all").chord).toBe("Mod + A");
    expect(getBinding("workspace.select-top-level-sections").chord).toBe(
      "Mod + Shift + A",
    );
    expect(getBinding("workspace.fit-view")).toMatchObject({
      chord: "F",
      label: "Fit view",
    });
    expect(getBinding("workspace.zoom-in").chord).toBe("Equal");
    expect(getBinding("workspace.zoom-out").chord).toBe("Minus");
    expect(getBinding("workspace.reset-zoom").chord).toBe("Mod + Comma");
    expect(getBinding("workspace.zoom-to-pointer").chord).toBe("Z");
    expect(getBinding("workspace.focus-next-section")).toMatchObject({
      chord: "Alt + J",
      label: "Focus next section",
    });
    expect(getBinding("workspace.focus-previous-section").chord).toBe(
      "Alt + K",
    );
    expect(getBinding("workspace.focus-leading-pane").chord).toBe(
      "Ctrl + Shift + 2",
    );
    expect(getBinding("workspace.focus-canvas").chord).toBe("Ctrl + Shift + 3");
    expect(getBinding("workspace.focus-trailing-pane")).toMatchObject({
      chord: "Ctrl + Shift + 4",
      chordLabel: "Ctrl + Shift + 4",
      label: "Focus trailing pane",
    });
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
    expect(getBinding("workspace.ungroup-sections").chordLabel).toBe(
      "⌘ + Shift + G",
    );

    expect(getBinding("workspace.focus-item-filter").chordLabel).toBe("⌘ + K");
    expect(
      getWorkspaceKeyBindingChordLabel(host, "workspace.focus-item-filter"),
    ).toBe("⌘ + K");
  });

  it("resolves one binding's chord label from the registry, or null when unbound", () => {
    expect(
      getWorkspaceKeyBindingChordLabel(host, "workspace.focus-item-filter"),
    ).toBe("Ctrl + K");
    expect(
      getWorkspaceKeyBindingChordLabel(host, "workspace.lock-sections"),
    ).toBeNull();
    expect(() =>
      getWorkspaceKeyBindingChordLabel(host, "workspace.not-an-operation"),
    ).toThrow("is not a workspace operation");

    registerWorkspaceKeyBindings(host, [
      { id: "workspace.focus-item-filter", chord: null },
    ]);
    expect(
      getWorkspaceKeyBindingChordLabel(host, "workspace.focus-item-filter"),
    ).toBeNull();
  });

  it("ships no conflicting default chords", () => {
    expect(getWorkspaceKeyBindingConflicts(host, [])).toEqual([]);
  });

  it("replaces the complete host set and leaves unnamed bindings on their defaults", () => {
    registerWorkspaceKeyBindings(host, [
      { id: "workspace.lock-sections", chord: "Mod + Alt + L" },
    ]);
    expect(getBinding("workspace.lock-sections")).toMatchObject({
      chord: "Mod + Alt + L",
      origin: "host",
    });
    expect(getBinding("workspace.group-sections").origin).toBe("default");

    registerWorkspaceKeyBindings(host, []);
    expect(getBinding("workspace.lock-sections").chord).toBeNull();
  });

  it("unbinds an operation the host wants the chord back from", () => {
    registerWorkspaceKeyBindings(host, [
      { id: "workspace.delete-sections", chord: null },
    ]);
    expect(getBinding("workspace.delete-sections")).toMatchObject({
      chord: null,
      origin: "host",
    });
    expect(
      getResolvedWorkspaceKeyBindings(host, false).some(
        (binding) => binding.definition.id === "workspace.delete-sections",
      ),
    ).toBe(false);
  });

  it("fails registration for an unknown operation, a repeated binding, or an unusable chord", () => {
    expect(() =>
      registerWorkspaceKeyBindings(host, [
        { id: "workspace.run-code", chord: "Mod + Enter" },
      ]),
    ).toThrow(/is not a workspace operation/u);
    expect(() =>
      registerWorkspaceKeyBindings(host, [
        { id: "workspace.lock-sections", chord: "Mod + Alt + L" },
        { id: "workspace.lock-sections", chord: "Mod + Alt + K" },
      ]),
    ).toThrow(/bound twice/u);
    expect(() =>
      registerWorkspaceKeyBindings(host, [
        { id: "workspace.lock-sections", chord: "Mod + Grab" },
      ]),
    ).toThrow(/unknown key grab/u);
  });

  it("reports the bindings that would share a chord before it is registered", () => {
    const candidate = [{ id: "workspace.lock-sections", chord: "Mod + G" }];
    expect(getWorkspaceKeyBindingConflicts(host, candidate)).toEqual([
      {
        chord: "Mod + G",
        chordLabel: "Ctrl + G",
        bindingIds: ["workspace.group-sections", "workspace.lock-sections"],
        reservedGesture: null,
      },
    ]);
    expect(() => registerWorkspaceKeyBindings(host, candidate)).toThrow(
      /Ctrl \+ G is claimed by workspace.group-sections, workspace.lock-sections/u,
    );
    expect(getBinding("workspace.lock-sections").chord).toBeNull();
  });

  it("collides Mod with Ctrl only on the platform where they are one key", () => {
    const candidate = [{ id: "workspace.lock-sections", chord: "Ctrl + G" }];
    expect(getWorkspaceKeyBindingConflicts(host, candidate)).toEqual([
      {
        chord: "Mod + G",
        chordLabel: "Ctrl + G",
        bindingIds: ["workspace.group-sections", "workspace.lock-sections"],
        reservedGesture: null,
      },
    ]);
    expect(() => registerWorkspaceKeyBindings(host, candidate)).toThrow(
      /Ctrl \+ G is claimed by workspace.group-sections, workspace.lock-sections/u,
    );

    mockIsMacOs = true;
    expect(getWorkspaceKeyBindingConflicts(host, candidate)).toEqual([]);
    registerWorkspaceKeyBindings(host, candidate);
    expect(getBinding("workspace.lock-sections").chordLabel).toBe("Ctrl + G");
    expect(getBinding("workspace.group-sections").chordLabel).toBe("⌘ + G");
  });

  it("refuses a chord a held interaction gesture already owns", () => {
    const candidate = [{ id: "workspace.lock-sections", chord: "Mod + Shift" }];
    expect(getWorkspaceKeyBindingConflicts(host, candidate)).toEqual([
      {
        chord: "Mod + Shift",
        chordLabel: "Ctrl + Shift",
        bindingIds: ["workspace.lock-sections"],
        reservedGesture: "parameter selection",
      },
    ]);
    expect(() => registerWorkspaceKeyBindings(host, candidate)).toThrow(
      /reserved for parameter selection/u,
    );
  });

  it("frees a default chord once the host moves the operation off it", () => {
    registerWorkspaceKeyBindings(host, [
      { id: "workspace.group-sections", chord: "Mod + Alt + G" },
      { id: "workspace.lock-sections", chord: "Mod + G" },
    ]);
    expect(getBinding("workspace.group-sections").chord).toBe("Mod + Alt + G");
    expect(getBinding("workspace.lock-sections").chord).toBe("Mod + G");
  });

  it("resolves the chord rules for the platform it dispatches on", () => {
    const macOS = getResolvedWorkspaceKeyBindings(host, true);
    const other = getResolvedWorkspaceKeyBindings(host, false);
    const macMoveUp = macOS.find(
      (binding) => binding.definition.id === "workspace.move-items-up",
    );
    const deleteSections = other.find(
      (binding) => binding.definition.id === "workspace.delete-sections",
    );

    expect(macMoveUp).toMatchObject({
      suppressesBrowserDefault: true,
      yieldsToEditableTarget: false,
    });
    expect(deleteSections).toMatchObject({
      suppressesBrowserDefault: false,
      yieldsToEditableTarget: true,
    });
  });

  it("lists a creation command that carries a chord beside the package operations", () => {
    registerCreationCommand("N");
    expect(getBinding("host-note")).toMatchObject({
      chord: "N",
      chordLabel: "N",
      label: "Host note",
      origin: "default",
    });
  });

  it("offers a creation command without a chord as an unbound operation", () => {
    registerCreationCommand(null);
    expect(getBinding("host-note")).toMatchObject({
      chord: null,
      chordLabel: null,
    });
  });

  it("refuses a creation chord a package operation already answers to", () => {
    expect(() => registerCreationCommand("Mod + G")).toThrow(
      /Ctrl \+ G is claimed by workspace.group-sections, host-note/u,
    );
    expect(
      getWorkspaceKeyBindings(host).some(
        (binding) => binding.id === "host-note",
      ),
    ).toBe(false);
  });

  it("rebinds and unbinds a creation command through the same host registration", () => {
    registerCreationCommand("N");
    registerWorkspaceKeyBindings(host, [
      { id: "host-note", chord: "Mod + Alt + N" },
    ]);
    expect(getBinding("host-note")).toMatchObject({
      chord: "Mod + Alt + N",
      origin: "host",
    });
    expect(
      getWorkspaceKeyBindingConflicts(host, [{ id: "host-note", chord: "F" }]),
    ).toMatchObject([{ bindingIds: ["workspace.fit-view", "host-note"] }]);
    registerWorkspaceKeyBindings(host, [{ id: "host-note", chord: null }]);
    expect(getBinding("host-note").chord).toBeNull();
  });

  it("fails when a replaced creation catalog drops a command the host rebound", () => {
    registerCreationCommand("N");
    registerWorkspaceKeyBindings(host, [
      { id: "host-note", chord: "Mod + Alt + N" },
    ]);
    expect(() => registerWorkspaceCreationCommands(host, [])).toThrow(
      /"host-note" is not a workspace operation/u,
    );
    expect(getBinding("host-note").chord).toBe("Mod + Alt + N");
  });

  it("hands Mod+A to a caret but keeps Mod+Shift+A on every platform", () => {
    for (const macOS of [true, false]) {
      const resolved = getResolvedWorkspaceKeyBindings(host, macOS);
      expect(
        resolved.find(
          (binding) => binding.definition.id === "workspace.select-all",
        ),
      ).toMatchObject({
        suppressesBrowserDefault: true,
        yieldsToEditableTarget: true,
      });
      expect(
        resolved.find(
          (binding) =>
            binding.definition.id === "workspace.select-top-level-sections",
        ),
      ).toMatchObject({
        suppressesBrowserDefault: true,
        yieldsToEditableTarget: false,
      });
      expect(
        resolved.find(
          (binding) => binding.definition.id === "workspace.fit-view",
        ),
      ).toMatchObject({
        suppressesBrowserDefault: false,
        yieldsToEditableTarget: true,
      });
    }
  });
});
