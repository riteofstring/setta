import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";

test("Test IdNameCombobox", async () => {
  const state = { selected: 2 };
  const allItems = [
    { id: 1, name: "dogs" },
    { id: 2, name: "cats" },
    { id: 3, name: "elephants" },
  ];

  const props = {
    allItems,
    initialSelection: state.selected,
    onSelectedItemChange: (id) => {
      state.selected = id;
    },
  };

  render(<IdNameCombobox {...props} />);

  // should have initial selection displayed
  const searchBox = screen.getByRole("textbox");
  expect(searchBox.value).toEqual("cats");
  expect(state.selected).toEqual(2);

  // clear search box and type "dogs"
  await userEvent.clear(searchBox);
  await userEvent.type(searchBox, "dogs");
  expect(searchBox.value).toEqual("dogs");
  let listItems = screen.getAllByTestId("ComboboxListItem");
  expect(listItems.length).toEqual(1);

  // tabbing away should reset to "cats"
  await userEvent.tab();
  expect(searchBox.value).toEqual("cats");

  // typing in nothing should show all items
  await userEvent.clear(searchBox);
  listItems = screen.getAllByTestId("ComboboxListItem");
  expect(listItems.length).toEqual(allItems.length);

  // tabbing away should reset to "cats"
  await userEvent.tab();
  expect(searchBox.value).toEqual("cats");

  // all items should show after clicking on searchbox with field filled in
  await userEvent.click(searchBox);
  listItems = screen.getAllByTestId("ComboboxListItem");
  expect(listItems.length).toEqual(allItems.length);

  // editing the field should result in filtering
  await userEvent.type(searchBox, "{backspace}");
  expect(searchBox.value).toEqual("cat");
  listItems = screen.getAllByTestId("ComboboxListItem");
  expect(listItems.length).toEqual(1);

  // escape, click on searchbox, then select an item
  // state.selected should now be the new id
  await userEvent.tab();
  await userEvent.click(searchBox);
  listItems = screen.getAllByTestId("ComboboxListItem");
  await userEvent.click(listItems[2]);
  expect(state.selected).toEqual(allItems[2].id);
});
