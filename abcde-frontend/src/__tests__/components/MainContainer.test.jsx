import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import MainContainer from "components/AppContainer/Main/MainContainer";
import { PANEID } from "utils/constants";
import { ResizeObserver } from "__tests__utils/resizeObserverDummy";
import {
  createStoreWrapperWithData,
  sectionIdFromName,
} from "__tests__utils/utils";

// required to avoid "ReferenceError: ResizeObserver is not defined"
global.ResizeObserver = ResizeObserver;

test("Tabbing away from Overview should focus onto a section when UI config is closed", async () => {
  await createMainContainer();
  const overviewSearch = getOverviewSearch();
  overviewSearch.focus();
  await userEvent.tab();

  const modelSectionTitle = screen.getByDisplayValue("Model");
  expect(modelSectionTitle).toHaveFocus();
});

test("Overview listing should be filtered by text in search bar", async () => {
  const { store } = await createMainContainer();
  const overviewSearch = getOverviewSearch();

  // First check that the listings match the existing sections
  const sections = store.getState().sectionInfos.x;
  const overviewListingRegex = /Overview Listing .+/;
  let overviewListings = screen.getAllByTestId(overviewListingRegex);
  expect(overviewListings.length).toEqual(Object.values(sections).length);
  for (let s of Object.values(sections)) {
    expect(screen.getByTestId(`Overview Listing ${s.id}`)).toBeTruthy();
  }

  // Now test filtering via search
  await userEvent.type(overviewSearch, "optim");
  overviewListings = screen.getAllByTestId(overviewListingRegex);
  expect(overviewListings.length).toEqual(1);
  const optimizerSectionId = sectionIdFromName(store, "Optimizer");
  expect(
    screen.getByTestId(`Overview Listing ${optimizerSectionId}`)
  ).toBeTruthy();
});

test("Jump to section", async () => {
  const { store } = await createMainContainer();
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
  await createMainContainer();
  let sectionTitle = screen.getByDisplayValue("Optimizer");
  await userEvent.clear(sectionTitle);
  await userEvent.type(sectionTitle, "Optim");
  await waitFor(async () => await userEvent.tab());
  expect(screen.getByDisplayValue("Optim")).toBeTruthy();

  sectionTitle = screen.getByDisplayValue("Optim");
  await userEvent.clear(sectionTitle);
  await userEvent.type(sectionTitle, "Model");
  await waitFor(async () => await userEvent.tab());
  // "Model" is already taken, so it reverts to Optim
  expect(screen.getByDisplayValue("Optim")).toBeTruthy();
});

function getOverviewSearch() {
  return screen.getByRole("textbox", {
    name: "Overview Search",
  });
}

async function createMainContainer() {
  const { store, wrapper } = await createStoreWrapperWithData();
  render(<MainContainer />, {
    wrapper,
  });
  return { store, wrapper };
}
