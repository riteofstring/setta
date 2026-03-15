import { createSettingsState } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";

import {
  getFocusShortcutRegistrations,
  getTooltipShortcutRegistrations,
} from "./keyShortcutRegistrationGroups";

describe("getTooltipShortcutRegistrations", () => {
  it("keeps tooltip tracking registrations discoverable for key-up coordination", () => {
    // Tooltip paging and copy shortcuts must stay tracked so the listener can
    // keep the floating tooltip open while any of them remain pressed.
    const registrations = getTooltipShortcutRegistrations(
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
});

describe("getFocusShortcutRegistrations", () => {
  it("keeps tab navigation registered through the shared focus handler", () => {
    // Tab and Shift+Tab must stay on the shared focus handler so focus movement
    // and Tab-owned param indentation remain coordinated in one place.
    const registrations = getFocusShortcutRegistrations(
      createSettingsState().shortcuts,
    );

    const normalizedCombos = registrations.map((registration) =>
      registration.keyCombo?.toLowerCase(),
    );

    expect(normalizedCombos).toContain("tab");
    expect(normalizedCombos).toContain("shift + tab");
  });
});
