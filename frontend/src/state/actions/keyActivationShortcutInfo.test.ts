import { useSettings } from "state/stores/uiPreferenceStores";
import { createSettingsState } from "utils/generatedTypes";
import { describe, expect, it } from "vitest";
import { createKeyActivationShortcutInfo } from "./keyActivationShortcutInfo";

describe("keyActivationShortcutInfo", () => {
  it("keeps tooltip tracking shortcuts grouped under one keep-key-down condition", () => {
    // Tooltip paging and copy shortcuts should still share the keep-key-down
    // condition so the floating tooltip stays open while related keys remain pressed.
    useSettings.setState(createSettingsState());
    const shortcutInfo = createKeyActivationShortcutInfo({
      shortcuts: useSettings.getState().shortcuts,
      isMacOsHost: false,
      getPressedKeys: () => new Set<string>(),
    });

    const showTooltipInfo = shortcutInfo.find(
      (info) => info.trackingName === "showTooltipShortcut",
    );

    expect(showTooltipInfo?.keepKeyDownCondition).toBeTypeOf("function");
  });
});
