import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MainContainer from "components/AppContainer/Main/MainContainer";
import { act } from "react-dom/test-utils";
import { PANEID } from "utils/constants";
import { createStoreWrapperWithData } from "__tests__utils/createStoreWrapperWithData";

// required to avoid "ReferenceError: ResizeObserver is not defined"
global.ResizeObserver = require("resize-observer-polyfill");

test("Tab away from Overview", async () => {
  createMainContainer();
  const overviewSearch = getOverviewSearch();
  overviewSearch.focus();
  await userEvent.tab();

  const modelSectionTitle = screen.getByDisplayValue("Model");
  expect(modelSectionTitle).toHaveFocus();
});

test("Overview search", async () => {
  const { store } = createMainContainer();
  const overviewSearch = getOverviewSearch();

  // First check that the listings match the existing sections
  const sectionNames = store.getState().sectionInfos.idNames;
  let overviewListings = screen.getAllByLabelText(/Overview .+ Listing/);
  expect(overviewListings.length === Object.values(sectionNames).length);
  for (let k of Object.values(sectionNames)) {
    expect(screen.getByLabelText(`Overview ${k} Listing`)).toBeTruthy();
  }

  // Now test filtering via search
  await userEvent.type(overviewSearch, "optim");
  overviewListings = screen.getAllByLabelText(/Overview .+ Listing/);
  expect(overviewListings.length === 1);
  expect(screen.getByLabelText(`Overview Optimizer Listing`)).toBeTruthy();
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

test("Unique section name constraint", async () => {
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
