import { render, screen } from "@testing-library/react";
import { IdNameCombobox } from "utils/Combobox/IdNameCombobox";

test("Test combobox search", async () => {
  const props = {
    allItems: [
      { id: 1, name: "dogs" },
      { id: 2, name: "cats" },
      { id: 3, name: "elephants" },
    ],
    initialSelection: 2,
    onSelectedItemChange: () => {},
  };

  render(<IdNameCombobox {...props} />);

  const searchBox = screen.getByRole("textbox");
  expect(searchBox.value).toEqual("cats");
});
