import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("./useIdNameCombobox", () => ({
  useIdNameCombobox: () => ({
    filteredItems: [],
    getInputProps: () => ({}),
    getItemProps: () => ({}),
    getMenuProps: () => ({}),
    getToggleButtonProps: () => ({}),
    highlightedIndex: -1,
    isOpen: false,
    itemToString: (item: { name?: string } | string | null) =>
      typeof item === "string" ? item : item?.name ?? "",
    onKeyDown: () => undefined,
    openMenu: () => undefined,
    selection: { id: "any", name: "Any" },
  }),
}));

import { IdNameCombobox } from "./IdNameCombobox";

describe("IdNameCombobox canvas-owned resting input", () => {
  it("uses the lightweight resting root as the row-level value container", () => {
    const markup = renderToStaticMarkup(
      <IdNameCombobox
        allItems={[{ group: "Choices", items: [{ id: "any", name: "Any" }] }]}
        canvasOwnedRestingInput={true}
        value="any"
        onSelectedItemChange={() => undefined}
        outerDivClasses="section-value flex justify-self-start self-center [&_search]:my-auto"
        small={true}
      />,
    );

    expect(markup).toContain(
      'data-canvas-owned-resting-dropdown-lightweight="true"',
    );
    expect(markup).toContain(
      "section-value flex justify-self-start self-center",
    );
    expect(markup).not.toContain(
      "flex h-[20px] relative w-full min-w-0 flex-col items-stretch overflow-visible",
    );
  });
});
