import { createSettingsState } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import {
  getFocusShortcutRegistrations,
  getPaneNavigationShortcutRegistrations,
} from "./keyShortcutNavigationRegistrations";

describe("keyShortcutNavigationRegistrations", () => {
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

  it("keeps pane navigation shortcuts separate from canvas registrations", () => {
    // Pane-tab shortcuts should stay grouped with navigation instead of the canvas command set.
    const shortcuts = createSettingsState().shortcuts;
    const registrations = getPaneNavigationShortcutRegistrations(shortcuts);

    const normalizedCombos = registrations.map(
      (registration) => registration.keyCombo,
    );

    expect(normalizedCombos).toContain(shortcuts.showVersionsTabShortcut);
    expect(normalizedCombos).toContain(shortcuts.showParamUITypeTabShortcut);
    expect(normalizedCombos).toContain(
      shortcuts.showProjectOverviewTabShortcut,
    );
  });
});
