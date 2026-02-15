import { describe, expect, it } from "vitest";
import {
  CALENDAR_PRESET_ID,
  getVirtualTextParamPresetItemsForFilter,
  TIME_DISPLAY_PRESET_ID,
} from "./UITypeCombobox";

describe("getVirtualTextParamPresetItemsForFilter", () => {
  it("includes date and time virtual presets for control params", () => {
    const items = getVirtualTextParamPresetItemsForFilter("control");
    expect(items).toEqual([
      { id: CALENDAR_PRESET_ID, name: "Calendar - (TextParam)" },
      { id: TIME_DISPLAY_PRESET_ID, name: "Time Display - (TextParam)" },
    ]);
  });

  it("includes date and time virtual presets for section params", () => {
    const items = getVirtualTextParamPresetItemsForFilter("sectionParam");
    expect(items).toEqual([
      { id: CALENDAR_PRESET_ID, name: "Calendar - (TextParam)" },
      { id: TIME_DISPLAY_PRESET_ID, name: "Time Display - (TextParam)" },
    ]);
  });
});
