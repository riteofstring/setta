import { describe, expect, it, vi } from "vitest";
import { buildIdNameComboboxView } from "./idNameComboboxView";

describe("buildIdNameComboboxView", () => {
  it("uses the normal-height wrapper and default selection flags", () => {
    const onSelectedItemChange = vi.fn();

    expect(
      buildIdNameComboboxView({
        allItems: [
          { group: "Choices", items: [{ id: "alpha", name: "Alpha" }] },
        ],
        onSelectedItemChange,
        value: "alpha",
      }),
    ).toEqual({
      hookOptions: {
        allItems: [
          { group: "Choices", items: [{ id: "alpha", name: "Alpha" }] },
        ],
        clearInputAfterSelection: false,
        onSelectedItemChange,
        selectedItemCanBeNull: false,
        value: "alpha",
      },
      rootClassName:
        "flex h-8 relative w-full min-w-0 flex-col items-stretch overflow-visible",
    });
  });

  it("uses the compact wrapper height and preserves explicit selection settings", () => {
    const onSelectedItemChange = vi.fn();

    expect(
      buildIdNameComboboxView({
        allItems: [{ group: "Choices", items: [{ id: "beta", name: "Beta" }] }],
        clearInputAfterSelection: true,
        onSelectedItemChange,
        outerDivClasses: "text-left",
        selectedItemCanBeNull: true,
        small: true,
        value: null,
      }),
    ).toEqual({
      hookOptions: {
        allItems: [{ group: "Choices", items: [{ id: "beta", name: "Beta" }] }],
        clearInputAfterSelection: true,
        onSelectedItemChange,
        selectedItemCanBeNull: true,
        value: null,
      },
      rootClassName:
        "flex h-[20px] relative w-full min-w-0 flex-col items-stretch overflow-visible text-left",
    });
  });
});
