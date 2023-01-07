import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useSectionInfos } from "models/info/sectionInfos";
import {
  createMainContainer,
  getAllOverviewListings,
  getOverviewSearch,
} from "__tests__utils/createMainContainer";
import { sectionIdFromName } from "__tests__utils/utils";

test("Tabbing away from Overview should focus onto a section when UI config is closed", async () => {
  await createMainContainer();
  const overviewSearch = getOverviewSearch();
  overviewSearch.focus();
  await userEvent.tab();

  const modelSectionId = sectionIdFromName("Model");
  const modelCloseButton = screen.getByTestId(`Delete ${modelSectionId}`);
  expect(modelCloseButton).toHaveFocus();
});

test("Overview listing should be filtered by text in search bar", async () => {
  await createMainContainer();
  const overviewSearch = getOverviewSearch();

  // First check that the listings match the existing sections
  const sections = useSectionInfos.getState().x;
  let overviewListings = getAllOverviewListings();
  expect(overviewListings.length).toEqual(Object.values(sections).length);
  for (const sid of Object.keys(sections)) {
    expect(screen.getByTestId(`Overview Listing ${sid}`)).toBeTruthy();
  }

  // Now test filtering via search
  await userEvent.type(overviewSearch, "optim");
  overviewListings = getAllOverviewListings();
  expect(overviewListings.length).toEqual(1);
  const optimizerSectionId = sectionIdFromName("Optimizer");
  expect(
    screen.getByTestId(`Overview Listing ${optimizerSectionId}`)
  ).toBeTruthy();
});

test("Section names should be unique among siblings.", async () => {
  await createMainContainer();
  const optimizerSectionId = sectionIdFromName("Optimizer");
  let section = screen.getByTestId(`${optimizerSectionId} section core`);

  let sectionTitle = within(section).getByText("Optimizer");
  await userEvent.click(sectionTitle);
  sectionTitle = within(section).getByDisplayValue("Optimizer");
  await userEvent.clear(sectionTitle);
  await userEvent.type(sectionTitle, "Optim");
  await waitFor(async () => await userEvent.tab());
  expect(within(section).getByText("Optim")).toBeTruthy();

  sectionTitle = within(section).getByText("Optim");
  await userEvent.click(sectionTitle);
  sectionTitle = within(section).getByDisplayValue("Optim");
  await userEvent.clear(sectionTitle);
  await userEvent.type(sectionTitle, "Model");
  await waitFor(async () => await userEvent.tab());
  // "Model" is already taken, so it reverts to Optim
  expect(within(section).getByText("Optim")).toBeTruthy();
});
