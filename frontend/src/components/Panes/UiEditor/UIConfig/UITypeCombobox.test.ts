import { describe, expect, it } from "vitest";
import {
  CALENDAR_PRESET_ID,
  getVirtualDateTimePresetItemsForFilter,
} from "./UITypeCombobox";

describe("getVirtualDateTimePresetItemsForFilter", () => {
  it("includes only the calendar virtual preset for control params", () => {
    const items = getVirtualDateTimePresetItemsForFilter("control");
    expect(items).toEqual([
      { id: CALENDAR_PRESET_ID, name: "Calendar - (DateParam)" },
    ]);
  });

  it("does not include calendar presets for section params", () => {
    const items = getVirtualDateTimePresetItemsForFilter("sectionParam");
    expect(items).toEqual([]);
  });
});
