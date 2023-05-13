import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NULL_OBJ_ID } from "abcde-utils/src/constants";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";
import { flattenedItems } from "utils/Combobox/utils";
import { ResizeObserver } from "__tests__utils/utils";

// required to avoid "ReferenceError: ResizeObserver is not defined"
global.ResizeObserver = ResizeObserver;

describe("IdNameCombobox", () => {
  let state;
  let allItems;
  let allFlattened;
  let props;

  beforeAll(() => {
    state = { selected: 2 };
    allItems = [
      {
        group: "animals",
        items: [
          { id: 1, name: "dogs" },
          { id: 2, name: "cats" },
          { id: 3, name: "elephants" },
        ],
      },
    ];

    allFlattened = flattenedItems(allItems);

    props = {
      allItems,
      initialSelection: state.selected,
      onSelectedItemChange: (id) => {
        state.selected = id;
      },
    };
  });

  it("should have initial selection displayed", async () => {
    const { searchBox } = renderIdNameCombobox(props);
    expect(searchBox.value).toEqual("cats");
    expect(state.selected).toEqual(2);
  });

  it("should show 1 match when typing in 'dogs', then reset to 'cats' when tabbing away", async () => {
    const { searchBox } = renderIdNameCombobox(props);
    await userEvent.clear(searchBox);
    await userEvent.type(searchBox, "dogs");
    expect(searchBox.value).toEqual("dogs");
    const listItems = screen.getAllByTestId("ComboboxListItem");
    expect(listItems.length).toEqual(1);
    await userEvent.tab();
    expect(searchBox.value).toEqual("cats");
  });

  it("should show all items when clearing the search field, and the value should remain as 'cats' when tabbing away", async () => {
    const { searchBox } = renderIdNameCombobox(props);
    await userEvent.clear(searchBox);
    const listItems = screen.getAllByTestId("ComboboxListItem");
    expect(listItems.length).toEqual(allFlattened.length);
    await userEvent.tab();
    expect(searchBox.value).toEqual("cats");
  });

  it("should show all items after clicking on searchbox with field filled in", async () => {
    const { searchBox } = renderIdNameCombobox(props);
    await userEvent.click(searchBox);
    const listItems = screen.getAllByTestId("ComboboxListItem");
    expect(listItems.length).toEqual(allFlattened.length);
  });

  it("should show filtered results when editing the search field, and clicking on the edited field shouldn't change the content", async () => {
    const { searchBox } = renderIdNameCombobox(props);
    await userEvent.type(searchBox, "{backspace}");
    expect(searchBox.value).toEqual("cat");
    const listItems = screen.getAllByTestId("ComboboxListItem");
    expect(listItems.length).toEqual(1);
    await userEvent.click(searchBox);
    expect(searchBox.value).toEqual("cat");
  });

  it("should select the correct id after clicking on searchbox, and selecting an item", async () => {
    const { searchBox } = renderIdNameCombobox(props);
    await userEvent.click(searchBox);
    const listItems = screen.getAllByTestId("ComboboxListItem");
    await userEvent.click(listItems[2]);
    expect(state.selected).toEqual(allFlattened[2].id);
  });

  it("should set the selected value to be NULL_OBJ_ID if the searchable items are removed", async () => {
    const { rerender } = renderIdNameCombobox(props);
    rerender(<IdNameCombobox {...props} allItems={[]} />);
    expect(state.selected).toEqual(NULL_OBJ_ID);
  });
});

function renderIdNameCombobox(props) {
  const { rerender } = render(<IdNameCombobox {...props} />);
  const searchBox = screen.getByRole("textbox");
  return { rerender, searchBox };
}
