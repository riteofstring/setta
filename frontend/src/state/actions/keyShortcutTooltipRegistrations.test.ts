import { createSettingsState } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { getTooltipShortcutRegistrations } from "./keyShortcutTooltipRegistrations";

describe("keyShortcutTooltipRegistrations", () => {
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
