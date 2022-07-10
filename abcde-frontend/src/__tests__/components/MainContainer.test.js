import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MainContainer from "components/AppContainer/Main/MainContainer";
import { PANEID } from "utils/constants";
import { createStoreWrapperWithData } from "__tests__utils/createStoreWrapperWithData";

// required to avoid "ReferenceError: ResizeObserver is not defined"
global.ResizeObserver = require("resize-observer-polyfill");

test("Tab away from Overview", async () => {
  createMainContainer();
  const overviewSearch = screen.getByRole("textbox", {
    name: "Overview Search",
  });
  overviewSearch.focus();
  await userEvent.tab();

  const modelSectionTitle = screen.getByDisplayValue("Model");
  expect(modelSectionTitle).toHaveFocus();
});

test("Jump to section", async () => {
  const { store } = createMainContainer();
  const modelListing = screen.getByLabelText("Overview Model Listing");
  await userEvent.click(modelListing);

  const sectionPositions = store.getState().sectionPositions.sectionPositions;
  // Upon clicking section name, the sectionPosition is updated.
  // Since this is the first click on any section, sectionPositions
  // will contain only this section's position and the pane's position.
  expect(Object.keys(sectionPositions)).toEqual([
    "acd83563-2337-44c2-9b4d-db3641fcbc97",
    PANEID.toString(),
  ]);
});

function createMainContainer() {
  const { store, wrapper } = createStoreWrapperWithData();
  render(<MainContainer />, {
    wrapper,
  });
  return { store, wrapper };
}
