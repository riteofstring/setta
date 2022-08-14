import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MainContainer from "components/AppContainer/Main/MainContainer";
import { act } from "react-dom/test-utils";
import { PANEID } from "utils/constants";
import { createStoreWrapperWithData } from "__tests__utils/createStoreWrapperWithData";
import { sectionIdFromName } from "__tests__utils/utils";

// required to avoid "ReferenceError: ResizeObserver is not defined"
global.ResizeObserver = require("resize-observer-polyfill");

test("Tabbing away from Overview should focus onto a section when UI config is closed", async () => {
  createMainContainer();
  const overviewSearch = getOverviewSearch();
  overviewSearch.focus();
  await userEvent.tab();

  const modelSectionTitle = screen.getByDisplayValue("Model");
  expect(modelSectionTitle).toHaveFocus();
});

test("Overview listing should be filtered by text in search bar", async () => {
  const { store } = createMainContainer();
  const overviewSearch = getOverviewSearch();

  // First check that the listings match the existing sections
  const sections = store.getState().sectionInfos.x;
  const overviewListingRegex = /Overview Listing .+/;
  let overviewListings = screen.getAllByTestId(overviewListingRegex);
  expect(overviewListings.length === Object.values(sections).length);
  for (let s of Object.values(sections)) {
    expect(screen.getByTestId(`Overview Listing ${s.id}`)).toBeTruthy();
  }

  // Now test filtering via search
  await userEvent.type(overviewSearch, "optim");
  overviewListings = screen.getAllByTestId(overviewListingRegex);
  expect(overviewListings.length === 1);
  const optimizerSectionId = sectionIdFromName(store, "Optimizer");
  expect(
    screen.getByTestId(`Overview Listing ${optimizerSectionId}`)
  ).toBeTruthy();
});

test("Jump to section", async () => {
  const { store } = createMainContainer();
  const modelSectionId = sectionIdFromName(store, "Model");
  const modelListing = screen.getByTestId(`Overview Listing ${modelSectionId}`);
  await userEvent.click(modelListing);

  const sectionPositions = store.getState().sectionPositions.sectionPositions;
  // Upon clicking section name, the sectionPosition is updated.
  // Since this is the first click on any section, sectionPositions
  // will contain only this section's position and the pane's position.
  expect(Object.keys(sectionPositions)).toEqual([
    modelSectionId,
    PANEID.toString(),
  ]);
});

test("Section names should be unique among siblings.", async () => {
  createMainContainer();
  let sectionTitle = screen.getByDisplayValue("Optimizer");
  await userEvent.clear(sectionTitle);
  await userEvent.type(sectionTitle, "Optim");
  await act(async () => await userEvent.tab());
  expect(screen.getByDisplayValue("Optim")).toBeTruthy();

  sectionTitle = screen.getByDisplayValue("Optim");
  await userEvent.clear(sectionTitle);
  await userEvent.type(sectionTitle, "Model");
  await act(async () => await userEvent.tab());
  // "Model" is already taken, so it reverts to Optim
  expect(screen.getByDisplayValue("Optim")).toBeTruthy();
});

function getOverviewSearch() {
  return screen.getByRole("textbox", {
    name: "Overview Search",
  });
}

function createMainContainer() {
  const { store, wrapper } = createStoreWrapperWithData();
  render(<MainContainer />, {
    wrapper,
  });
  return { store, wrapper };
}
