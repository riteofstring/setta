import { createSettingsState } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { getCanvasShortcutRegistrations } from "./keyShortcutWorkspaceRegistrations";

describe("keyShortcutWorkspaceRegistrations", () => {
  it("keeps canvas shortcuts free of pane-tab navigation bindings", () => {
    // Canvas commands should stay distinct from pane-tab navigation so ownership stays obvious.
    const shortcuts = createSettingsState().shortcuts;
    const registrations = getCanvasShortcutRegistrations(shortcuts);

    const normalizedCombos = registrations.map(
      (registration) => registration.keyCombo,
    );

    expect(normalizedCombos).toContain(shortcuts.fitViewShortcut);
    expect(normalizedCombos).toContain(shortcuts.zoomToMouseShortcut);
    expect(normalizedCombos).not.toContain(shortcuts.showVersionsTabShortcut);
    expect(normalizedCombos).not.toContain(
      shortcuts.showProjectOverviewTabShortcut,
    );
  });
});
