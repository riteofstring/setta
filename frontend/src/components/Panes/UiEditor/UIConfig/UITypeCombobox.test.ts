import { describe, expect, it } from "vitest";
import {
  DATE_PICKER_PRESET_ID,
  getVirtualTextParamPresetItemsForFilter,
  TIME_INPUT_PRESET_ID,
} from "./UITypeCombobox";

describe("getVirtualTextParamPresetItemsForFilter", () => {
  it("includes date and time virtual presets for control params", () => {
    const items = getVirtualTextParamPresetItemsForFilter("control");
    expect(items).toEqual([
      { id: DATE_PICKER_PRESET_ID, name: "Date Picker - (TextParam)" },
      { id: TIME_INPUT_PRESET_ID, name: "Time Input - (TextParam)" },
    ]);
  });

  it("includes date and time virtual presets for section params", () => {
    const items = getVirtualTextParamPresetItemsForFilter("sectionParam");
    expect(items).toEqual([
      { id: DATE_PICKER_PRESET_ID, name: "Date Picker - (TextParam)" },
      { id: TIME_INPUT_PRESET_ID, name: "Time Input - (TextParam)" },
    ]);
  });
});
