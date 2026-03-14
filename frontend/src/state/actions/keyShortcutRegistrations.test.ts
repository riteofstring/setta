import { createSettingsState } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import { createShortcutRegistrations } from "./keyShortcutRegistrations";

describe("createShortcutRegistrations", () => {
  it("keeps the tooltip shortcuts tracked for key-up coordination", () => {
    // Tooltip paging and copy shortcuts must stay discoverable so the listener can
    // keep the floating tooltip open while any of them remain pressed.
    const registrations = createShortcutRegistrations(
      createSettingsState().shortcuts,
    );

    expect(
      registrations
        .flatMap((registration) =>
          registration.trackingName ? [registration.trackingName] : [],
        )
        .sort(),
    ).toEqual([
      "copyTooltipTextShortcut",
      "decrementTooltipPageShortcut",
      "incrementTooltipPageShortcut",
      "showTooltipShortcut",
    ]);
  });

  it("omits duplicate param bindings when Tab owns indent and unindent", () => {
    // Tab-based param indentation should stay routed through the shared Tab handler
    // instead of registering duplicate dedicated shortcut entries.
    const registrations = createShortcutRegistrations(
      createSettingsState({
        shortcuts: {
          paramIndentShortcut: "Tab",
          paramUnindentShortcut: "Shift + Tab",
        },
      }).shortcuts,
    );

    const normalizedCombos = registrations.map((registration) =>
      registration.keyCombo?.toLowerCase(),
    );

    expect(normalizedCombos.filter((combo) => combo === "tab")).toHaveLength(1);
    expect(
      normalizedCombos.filter((combo) => combo === "shift + tab"),
    ).toHaveLength(1);
  });

  it("adds dedicated param bindings when indentation uses non-Tab shortcuts", () => {
    // Non-Tab param shortcuts still need their own registrations because the
    // shared focus-navigation handler no longer owns those key combos.
    const registrations = createShortcutRegistrations(
      createSettingsState({
        shortcuts: {
          paramIndentShortcut: "Ctrl + ]",
          paramUnindentShortcut: "Ctrl + [",
        },
      }).shortcuts,
    );

    const normalizedCombos = registrations.map((registration) =>
      registration.keyCombo?.toLowerCase(),
    );

    expect(normalizedCombos).toContain("ctrl + ]");
    expect(normalizedCombos).toContain("ctrl + [");
  });
});
